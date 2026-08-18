/* Máquina de pila de Bitcoin Script, genérica.
   candado-lan tiene una equivalente cableada a P2PKH (buildOps devuelve siempre los
   mismos 7 pasos); aquí hacen falta scripts distintos en varias diapositivas, así que
   el script es un string que se tokeniza y una tabla de opcodes hace el resto.

   NO es un intérprete compatible con consenso: no hay codificación de números en
   little-endian con signo, ni límite de 520 bytes por elemento, ni contador de
   sigops, ni las docenas de opcodes que no salen en la charla. Es material didáctico.

   La interfaz de createRunner() es la misma de candado-lan (ops, index, stack,
   finished, result, reset, step) con una extensión: step() devuelve un "frame" con
   qué se apiló y qué se sacó, que es lo que necesita la animación del deck. El
   .result de siempre viaja dentro del frame y sigue disponible como getter. */
(function (global) {
  'use strict';

  const CL = (global.CL = global.CL || {});

  // ---------- elementos de la pila ----------

  const num = (n) => ({ kind: 'num', value: n, label: String(n) });
  const hex = (h, prefijo) => ({
    kind: 'hex', value: h, label: (prefijo ? prefijo + ':' : '') + CL.short(h, 6),
  });
  const bool = (b) => ({ kind: 'bool', value: b, label: b ? 'TRUE' : 'FALSE', good: b, bad: !b });

  /** Comparación por valor: el kind da igual, lo que compara Script son los bytes. */
  const iguales = (a, b) => String(a.value) === String(b.value);

  /** Qué cuenta como "verdadero" al final del script. */
  const verdadero = (item) =>
    !item ? false : item.kind === 'bool' ? item.value : item.kind === 'num' ? item.value !== 0 : !!item.value;

  const aElemento = (valor) => (typeof valor === 'number' ? num(valor) : hex(String(valor)));

  // ---------- tabla de opcodes ----------

  /* Cada entrada trae su desc en español porque es literalmente lo que se proyecta
     al lado de la cinta. run() muta la pila in situ y devuelve undefined si todo va
     bien, o {failed, reason} si el script muere ahí — el contrato de candado-lan. */
  CL.OPS = {
    OP_DUP: {
      arity: 1, desc: 'Duplica el tope de la pila',
      run: (stack) => { stack.push({ ...stack[stack.length - 1] }); },
    },

    OP_DROP: {
      arity: 1, desc: 'Tira el tope',
      run: (stack) => { stack.pop(); },
    },

    OP_SWAP: {
      arity: 2, desc: 'Intercambia los dos de arriba',
      run: (stack) => {
        const a = stack.pop(), b = stack.pop();
        stack.push(a, b);
      },
    },

    OP_ADD: {
      arity: 2, desc: 'Suma los dos de arriba',
      run: (stack) => {
        const b = stack.pop(), a = stack.pop();
        stack.push(num(Number(a.value) + Number(b.value)));
      },
    },

    OP_EQUAL: {
      arity: 2, desc: '¿Son iguales? Apila TRUE o FALSE',
      run: (stack) => {
        const b = stack.pop(), a = stack.pop();
        stack.push(bool(iguales(a, b)));
      },
    },

    /* La diferencia con OP_EQUAL es el punto entero de la diapositiva de los dos fallos: este no
       apila FALSE, mata el script en el sitio. */
    OP_EQUALVERIFY: {
      arity: 2, desc: '¿Son iguales? Si no, aborta',
      run: (stack) => {
        const b = stack.pop(), a = stack.pop();
        if (!iguales(a, b)) {
          stack.push({ kind: 'bool', value: false, label: 'los hashes NO coinciden', bad: true });
          return { failed: true, reason: 'wrong-key' };
        }
      },
    },

    OP_SHA256: {
      arity: 1, desc: 'SHA256 del tope',
      run: (stack) => {
        const a = stack.pop();
        stack.push(hex(CL.sha256hex(String(a.value)), 'sha256'));
      },
    },

    OP_HASH160: {
      arity: 1, desc: 'RIPEMD160(SHA256(tope))',
      run: (stack) => {
        const a = stack.pop();
        stack.push(hex(CL.hash160(String(a.value)), 'hash160'));
      },
    },

    OP_CHECKSIG: {
      arity: 2, desc: 'Verifica la firma contra la pubkey',
      run: (stack, ctx) => {
        const pub = stack.pop(), sig = stack.pop();
        const ok = CL.verifySignature(String(pub.value), ctx.msgHash, String(sig.value));
        stack.push(bool(ok));
        return ok ? undefined : { failed: true, reason: 'bad-sig' };
      },
    },

    /* Disposición real: <dummy> <sig…> m <pub…> n OP_CHECKMULTISIG. El <dummy> es el
       elemento de más que el opcode consume por un error de 2009 que ya no se puede
       arreglar sin partir la cadena; se deja a la vista porque da una anécdota buena
       en la diapositiva de la familia de candados. */
    OP_CHECKMULTISIG: {
      arity: 5, desc: 'Verifica m firmas contra n pubkeys',
      run: (stack, ctx) => {
        const n = Number(stack.pop().value);
        const pubs = [];
        for (let i = 0; i < n; i++) pubs.unshift(String(stack.pop().value));
        const m = Number(stack.pop().value);
        const sigs = [];
        for (let i = 0; i < m; i++) sigs.unshift(String(stack.pop().value));
        stack.pop(); // el <dummy> del error de 2009

        // Las firmas van en el mismo orden que las pubkeys: se recorre en una pasada.
        let i = 0;
        for (const sig of sigs) {
          while (i < pubs.length && !CL.verifySignature(pubs[i], ctx.msgHash, sig)) i++;
          if (i >= pubs.length) {
            stack.push(bool(false));
            return { failed: true, reason: 'multisig-fail' };
          }
          i++;
        }
        stack.push(bool(true));
      },
    },

    /* No saca nada: deja la altura en la pila para que el script pueda seguir
       comparándola. Por eso en la práctica siempre va seguido de OP_DROP. */
    OP_CHECKLOCKTIMEVERIFY: {
      arity: 1, desc: '¿Ya pasó ese bloque? Si no, aborta',
      run: (stack, ctx) => {
        const exigido = Number(stack[stack.length - 1].value);
        if (Number(ctx.blockHeight) < exigido) {
          return { failed: true, reason: 'locktime-no-cumplido' };
        }
      },
    },
  };

  // ---------- parser ----------

  /* Etiquetas de los placeholders más usados, para que la cinta se lea en español
     en vez de mostrar "Se apila sig". Lo que no esté aquí cae al genérico. */
  const REFS = {
    sig: { prefijo: 'sig', desc: 'Se apila la firma' },
    pubkey: { prefijo: 'pub', desc: 'Se apila la llave pública' },
    pkh: { prefijo: 'candado', desc: 'El hash grabado en el candado' },
    dummy: { prefijo: 'dummy', desc: 'El elemento de más que OP_CHECKMULTISIG se come' },
  };

  const refInfo = (nombre) =>
    REFS[nombre] || { prefijo: nombre.replace(/\d+$/, ''), desc: `Se apila <${nombre}>` };

  /**
   * Tokeniza por espacios. Tres formas: entero, <placeholder> y OP_*.
   * Un opcode desconocido revienta aquí y no a mitad de la charla.
   * @returns {Array<{push?:object, op?:string}>}
   */
  CL.parse = function (src) {
    return String(src || '').trim().split(/\s+/).filter(Boolean).map((token) => {
      if (/^-?\d+$/.test(token)) return { push: { kind: 'num', value: Number(token) } };
      if (/^<[^<>]+>$/.test(token)) return { push: { ref: token.slice(1, -1) } };
      if (CL.OPS[token]) return { op: token };
      throw new Error(`Opcode desconocido: ${token}`);
    });
  };

  /**
   * Convierte los tokens en la cinta de {name, desc, run} que consume el runner.
   * Los <placeholders> se resuelven contra el contexto aquí, no al ejecutar, para
   * que un dato que falta se note al montar la diapositiva.
   */
  CL.buildOps = function (script, ctx) {
    return CL.parse(script).map((token) => {
      if (token.op) {
        const spec = CL.OPS[token.op];
        return {
          name: token.op,
          desc: spec.desc,
          run: (stack, contexto) => {
            if (stack.length < spec.arity) return { failed: true, reason: 'stack-vacia' };
            return spec.run(stack, contexto);
          },
        };
      }

      if (token.push.ref) {
        const nombre = token.push.ref;
        const { prefijo, desc } = refInfo(nombre);
        const valor = ctx[nombre];
        if (valor === undefined) throw new Error(`Falta <${nombre}> en el contexto`);
        const elemento = typeof valor === 'number' ? num(valor) : hex(String(valor), prefijo);
        return { name: `PUSH <${nombre}>`, desc, run: (stack) => { stack.push({ ...elemento }); } };
      }

      const elemento = aElemento(token.push.value);
      return {
        name: `PUSH ${elemento.label}`,
        desc: `Se apila ${elemento.label}`,
        run: (stack) => { stack.push({ ...elemento }); },
      };
    });
  };

  // ---------- ejecución ----------

  CL.reasonText = function (reason) {
    switch (reason) {
      case 'wrong-key':
        return 'Falla en OP_EQUALVERIFY: esa llave no corresponde al hash del candado.';
      case 'bad-sig':
        return 'Falla en OP_CHECKSIG: la firma no valida contra esa llave pública.';
      case 'multisig-fail':
        return 'Falla en OP_CHECKMULTISIG: no hay suficientes firmas válidas.';
      case 'locktime-no-cumplido':
        return 'Falla en OP_CHECKLOCKTIMEVERIFY: todavía no llega ese bloque.';
      case 'stack-vacia':
        return 'El opcode pedía más elementos de los que había en la pila.';
      case 'falso-final':
        return 'El script terminó, pero lo que quedó en el tope no es verdadero.';
      default:
        return 'Script inválido.';
    }
  };

  /** Ejecuta la cinta entera sin animación. Es lo que corren los tests. */
  CL.runScript = function (script, ctx) {
    const ops = CL.buildOps(script, ctx || {});
    const stack = [];
    for (let i = 0; i < ops.length; i++) {
      const verdict = ops[i].run(stack, ctx || {});
      if (verdict && verdict.failed) return { ok: false, reason: verdict.reason, failedAt: i };
    }
    const ok = verdadero(stack[stack.length - 1]);
    return { ok, reason: ok ? null : 'falso-final', failedAt: ops.length - 1 };
  };

  /**
   * Ejecutor paso a paso, uno por diapositiva interactiva.
   * step() devuelve el frame del paso que acaba de correr; result y stack siguen
   * siendo getters, igual que en candado-lan.
   */
  CL.createRunner = function (script, opciones) {
    const ctx = (opciones && opciones.context) || {};
    const ops = CL.buildOps(script, ctx);
    let index = 0;
    let stack = [];
    let finished = false;
    let result = null;

    return {
      ops,
      script,
      get index() { return index; },
      get stack() { return stack; },
      get finished() { return finished; },
      get result() { return result; },
      reset() { index = 0; stack = []; finished = false; result = null; },
      step() {
        if (finished) return null;
        const op = ops[index];
        const antes = stack.slice();
        const verdict = op.run(stack, ctx);
        index += 1;

        // Lo que la pila conserva sin tocar es el prefijo común: el resto salió y entró.
        let comun = 0;
        while (comun < antes.length && comun < stack.length && antes[comun] === stack[comun]) comun++;

        if (verdict && verdict.failed) {
          finished = true;
          result = { ok: false, reason: verdict.reason };
        } else if (index >= ops.length) {
          finished = true;
          const ok = verdadero(stack[stack.length - 1]);
          result = { ok, reason: ok ? null : 'falso-final' };
        }

        return {
          op: op.name,
          desc: op.desc,
          popped: antes.slice(comun),
          pushed: stack.slice(comun),
          failed: !!(verdict && verdict.failed),
          reason: (verdict && verdict.reason) || null,
          result,
        };
      },
    };
  };
})(window);
