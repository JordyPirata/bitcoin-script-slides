/* Cablea cada <section data-demo> con lo suyo.
   Las llaves se generan al cargar la página: cada charla firma con llaves distintas
   y la firma que se verifica en el P2PKH está hecha en ese momento. */
(function (global) {
  'use strict';

  const CL = (global.CL = global.CL || {});
  if (CL.sinVendor) return;   // el aviso de index.html ya está en pantalla

  const esc = CL.vmui.esc;

  // ---------- las llaves de la charla ----------

  const dueno = CL.ephemeralKey();
  const impostor = CL.ephemeralKey();
  const mensaje = CL.spendMessage(dueno.pkh, 'la cerveza de la charla');
  const firmaBuena = CL.signMessage(dueno, mensaje);
  const firmaImpostor = CL.signMessage(impostor, mensaje);

  const P2PKH = '<sig> <pubkey> OP_DUP OP_HASH160 <pkh> OP_EQUALVERIFY OP_CHECKSIG';

  const CTX = {
    correcto: {
      sig: firmaBuena.sigDer, pubkey: dueno.pubHex, pkh: dueno.pkh, msgHash: firmaBuena.msgHash,
    },
    llaveMala: {
      sig: firmaImpostor.sigDer, pubkey: impostor.pubHex, pkh: dueno.pkh, msgHash: firmaImpostor.msgHash,
    },
    firmaMala: {
      sig: CL.tamperSignature(firmaBuena.sigDer), pubkey: dueno.pubHex, pkh: dueno.pkh,
      msgHash: firmaBuena.msgHash,
    },
  };

  const demos = {};

  // ---------- la pila desnuda ----------

  demos.pila = function (contenedor) {
    const stack = [];
    contenedor.innerHTML =
      '<div class="sim-grid">' +
        '<div><div class="run-controls" style="margin-top:0">' +
          '<button data-push="2">Apilar 2</button>' +
          '<button data-push="3">Apilar 3</button>' +
          '<button class="secondary" data-push="hash">Apilar un hash</button>' +
          '<button class="secondary" data-pop>Sacar el tope</button>' +
          '<button class="secondary" data-clear>Vaciar</button>' +
        '</div>' +
        '<p class="small" style="margin-top:1em">Apilar es gratis. Lo interesante empieza cuando algo <b>consume</b> lo de arriba.</p></div>' +
        '<div><div class="stack-label">Pila</div><div class="stack"></div></div>' +
      '</div>';

    const stackEl = contenedor.querySelector('.stack');
    const pintar = () => CL.vmui.renderStack(stackEl, stack);

    contenedor.querySelectorAll('[data-push]').forEach((btn) => {
      btn.onclick = () => {
        const que = btn.dataset.push;
        stack.push(que === 'hash'
          ? { kind: 'hex', value: dueno.pkh, label: CL.short(dueno.pkh, 6) }
          : { kind: 'num', value: Number(que), label: que });
        pintar();
      };
    });
    contenedor.querySelector('[data-pop]').onclick = () => { stack.pop(); pintar(); };
    contenedor.querySelector('[data-clear]').onclick = () => { stack.length = 0; pintar(); };
    pintar();
  };

  // ---------- aritmética ----------

  demos.suma = function (contenedor) {
    CL.vmui.montar(contenedor, CL.createRunner('2 3 OP_ADD 5 OP_EQUAL', {}));
  };

  // ---------- los dos fallos ----------

  const INTENTOS = [
    { id: 'llaveMala', etiqueta: 'Llave equivocada', nota: 'Alguien firma con <b>su</b> llave un candado que iba dirigido a otra persona. Ni siquiera se llega a mirar la firma.' },
    { id: 'firmaMala', etiqueta: 'Firma inválida', nota: 'La llave es la correcta —el hash coincide— pero la firma está alterada. El script sobrevive un opcode más.' },
    { id: 'correcto', etiqueta: 'Todo correcto', nota: 'La misma máquina, con la llave y la firma que tocan.' },
  ];

  demos.fallos = function (contenedor) {
    contenedor.innerHTML =
      '<div class="run-controls" style="margin-top:0">' +
        INTENTOS.map((i, n) =>
          `<button class="${n === 0 ? '' : 'secondary'}" data-intento="${i.id}">${esc(i.etiqueta)}</button>`).join('') +
      '</div>' +
      '<p class="small" data-nota style="margin:.9em 0 1em"></p>' +
      '<div data-widget></div>';

    const ctrl = CL.vmui.montar(contenedor.querySelector('[data-widget]'),
      CL.createRunner(P2PKH, { context: CTX.llaveMala }));
    const nota = contenedor.querySelector('[data-nota]');
    const botones = [...contenedor.querySelectorAll('[data-intento]')];

    const elegir = (id) => {
      const intento = INTENTOS.find((i) => i.id === id);
      botones.forEach((b) => { b.className = b.dataset.intento === id ? '' : 'secondary'; });
      nota.innerHTML = intento.nota;
      ctrl.cargar(CL.createRunner(P2PKH, { context: CTX[id] }));
    };

    botones.forEach((b) => { b.onclick = () => elegir(b.dataset.intento); });
    elegir('llaveMala');
  };

  // ---------- la familia de candados ----------

  const P2PK = '<sig> <pubkey> OP_CHECKSIG';
  const MULTISIG = '<dummy> <sig1> <sig2> 2 <pub1> <pub2> <pub3> 3 OP_CHECKMULTISIG';

  /* Los tres primeros llevan máquina; los tres últimos, no. No es pereza: P2SH
     necesitaría ejecución en dos fases (correr el candado exterior y luego
     deserializar el tope de la pila como script), P2WPKH no se ejecuta como script en
     absoluto y P2TR es Schnorr, que elliptic no hace. Fingir una pila para esos tres
     sería mentir sobre cómo funcionan.

     P2PKH es el que más tiempo se lleva de la charla: se despliega y se recorre
     opcode por opcode con →, igual que tenía su propia diapositiva antes. */
  const FAMILIA = [
    {
      nombre: 'P2PK', anio: '2009', titulo: 'Pagar a una llave pública',
      script: '<span class="data">&lt;pubkey&gt;</span> <span class="op">OP_CHECKSIG</span>',
      texto: 'El primero que existió, y el candado más corto que hay: dos pasos. La llave pública queda escrita en la cadena para siempre, a la vista de todos, desde antes de gastar.',
      demo: 'p2pk',
    },
    {
      nombre: 'P2PKH', anio: '2010', titulo: 'Pagar al hash de una llave',
      script: '<span class="op">OP_DUP</span> <span class="op">OP_HASH160</span> <span class="data">&lt;hash&gt;</span> <span class="op">OP_EQUALVERIFY</span> <span class="op">OP_CHECKSIG</span>',
      texto: 'El clásico, y el que se lleva la mitad de la charla: direcciones cortas, y la llave pública solo aparece en el momento de gastar. Los dos pasos de más frente a P2PK son los que esconden la llave hasta el final.',
      demo: 'p2pkh',
    },
    {
      nombre: 'P2MS', anio: '2012', titulo: 'm de n firmas',
      script: '<span class="data">&lt;m&gt;</span> <span class="data">&lt;pubkeys…&gt;</span> <span class="data">&lt;n&gt;</span> <span class="op">OP_CHECKMULTISIG</span>',
      texto: 'Hacen falta m de las n llaves. Es la base de las tesorerías compartidas y de las carteras con respaldo.',
      demo: 'p2ms',
    },
    {
      nombre: 'P2SH', anio: '2012', titulo: 'El candado dentro del candado',
      script: '<span class="op">OP_HASH160</span> <span class="data">&lt;hash del script&gt;</span> <span class="op">OP_EQUAL</span>',
      texto: 'En la cadena solo se graba el <i>hash</i> de otro script. Quien gasta enseña el script entero y además lo cumple. Quien paga no necesita saber qué condiciones había dentro: paga a un hash y ya.',
    },
    {
      nombre: 'P2WPKH', anio: '2017', titulo: 'El mismo candado, movido de sitio',
      script: '<span class="data">0</span> <span class="data">&lt;hash&gt;</span>',
      texto: 'SegWit: la firma y la llave dejan de vivir en el <span class="mono">scriptSig</span> y pasan al testigo, fuera de lo que identifica a la transacción. Adiós a la <i>malleability</i>, y las firmas pesan menos.',
    },
    {
      nombre: 'P2TR', anio: '2021', titulo: 'Taproot',
      script: '<span class="data">1</span> <span class="data">&lt;punto&gt;</span>',
      texto: 'Firmas Schnorr y un árbol de condiciones alternativas. Si todo el mundo está de acuerdo, el gasto se ve exactamente igual que un pago normal: nadie sabe que había un contrato detrás.',
    },
  ];

  demos.familia = function (contenedor) {
    contenedor.innerHTML = '<div class="familia">' + FAMILIA.map((c) =>
      // name= los hace excluyentes: abrir uno cierra el anterior y la diapositiva no crece sin fin
      '<details name="familia">' +
        `<summary><b class="op">${esc(c.nombre)}</b><span class="anio">${esc(c.anio)}</span>` +
        `<span class="dim">${esc(c.titulo)}</span></summary>` +
        '<div class="cuerpo">' +
          `<p class="script-line">${c.script}</p>` +
          `<p class="small">${c.texto}</p>` +
          (c.demo ? `<div data-demo-familia="${c.demo}"></div>` : '') +
        '</div>' +
      '</details>').join('') + '</div>';

    const cajaP2PK = contenedor.querySelector('[data-demo-familia="p2pk"]');
    CL.vmui.montar(cajaP2PK, CL.createRunner(P2PK, { context: CTX.correcto }));
    nota(cajaP2PK, 'Sin <span class="mono op">OP_HASH160</span> y sin <span class="mono op">OP_EQUALVERIFY</span>: ' +
      'la llave se compara consigo misma. Añádele esos dos pasos delante y tienes el siguiente de la lista.');

    const cajaP2PKH = contenedor.querySelector('[data-demo-familia="p2pkh"]');
    CL.vmui.montar(cajaP2PKH, CL.createRunner(P2PKH, { context: CTX.correcto }));
    nota(cajaP2PKH, 'Llave pública <span class="mono data">' + esc(CL.short(dueno.pubHex, 8)) + '</span> · ' +
      'hash del candado <span class="mono data">' + esc(CL.short(dueno.pkh, 8)) + '</span>. ' +
      'Generadas en esta pestaña hace unos segundos; la firma se verifica de verdad.');

    const socios = [CL.ephemeralKey(), CL.ephemeralKey(), CL.ephemeralKey()];
    const msg = CL.spendMessage(socios[0].pkh, 'la tesorería');
    const firmas = socios.map((s) => CL.signMessage(s, msg));

    const cajaP2MS = contenedor.querySelector('[data-demo-familia="p2ms"]');
    CL.vmui.montar(cajaP2MS, CL.createRunner(MULTISIG, {
      context: {
        dummy: '00', msgHash: firmas[0].msgHash,
        sig1: firmas[0].sigDer, sig2: firmas[2].sigDer,
        pub1: socios[0].pubHex, pub2: socios[1].pubHex, pub3: socios[2].pubHex,
      },
    }));
    nota(cajaP2MS, 'Ese <span class="mono">&lt;dummy&gt;</span> del principio no lo usa nadie: ' +
      '<span class="mono op">OP_CHECKMULTISIG</span> consume un elemento de más por un error de 2009 que ya no se ' +
      'puede corregir sin partir la cadena en dos. Lleva ahí desde entonces.');
  };

  function nota(caja, html) {
    const p = document.createElement('p');
    p.className = 'small';
    p.style.marginTop = '.8em';
    p.innerHTML = html;
    caja.appendChild(p);
  }

  // ---------- QR ----------

  /* Se dibuja en el navegador, no es una imagen: así no hay nada que regenerar
     cuando cambia la URL de la sala el día de la charla. */
  function pintarQr(caja, url) {
    try {
      const qr = global.qrcode(0, 'M');
      qr.addData(url);
      qr.make();
      caja.innerHTML = qr.createSvgTag({ cellSize: 6, margin: 2 });
    } catch {
      caja.innerHTML = ''; // sin QR: proyectada, la URL grande ya sirve
    }
  }

  // ---------- dónde seguir ----------

  const RECURSOS = [
    {
      titulo: 'learnmeabitcoin',
      url: 'https://learnmeabitcoin.com/technical/script/',
      texto: 'Script explicado opcode por opcode, cada uno con su ejemplo y su diagrama de pila. Es donde se lee con calma lo que aquí solo dio tiempo a ver correr.',
    },
    {
      titulo: 'btcdeb',
      url: 'https://github.com/bitcoin-core/btcdeb',
      texto: 'Un depurador de Script de verdad, en la terminal: le pasas una transacción real y la recorres paso a paso. Esta charla es su versión de juguete.',
    },
    {
      titulo: 'opcodeexplained',
      url: 'https://opcodeexplained.com/',
      texto: 'Una página por opcode: qué saca de la pila, qué deja y en qué casos hace fallar el script. Para la duda concreta que sale a mitad de escribir algo.',
    },
  ];

  demos.recursos = function (contenedor) {
    contenedor.innerHTML = '<div class="tres">' + RECURSOS.map((r, i) =>
      '<div class="caja" style="text-align:center">' +
        `<div class="qr chico" data-qr="${i}"></div>` +
        `<h3 style="margin-top:.5em">${esc(r.titulo)}</h3>` +
        `<p class="small" style="margin-top:.4em">${esc(r.texto)}</p>` +
        `<p class="mono small" data-url>${esc(r.url)}</p>` +
      '</div>').join('') + '</div>';

    RECURSOS.forEach((r, i) => pintarQr(contenedor.querySelector(`[data-qr="${i}"]`), r.url));
  };

  // ---------- el QR de la sala ----------

  const CLAVE_SALA = 'bitcoin-script-slides/sala';
  const SALA_POR_DEFECTO = 'http://192.168.1.10:3000';

  demos.qr = function (contenedor) {
    contenedor.innerHTML =
      '<div class="qr" data-qr></div>' +
      '<p class="sala-url" data-url></p>' +
      '<form class="sala-form" data-form hidden>' +
        '<input type="text" data-input inputmode="url" placeholder="http://192.168.1.10:3000">' +
        '<button type="submit">Guardar</button>' +
      '</form>' +
      '<div class="run-controls" style="justify-content:center">' +
        '<button class="secondary tiny" data-editar>✎ Cambiar la URL de la sala</button>' +
      '</div>';

    const cajaQr = contenedor.querySelector('[data-qr]');
    const urlEl = contenedor.querySelector('[data-url]');
    const form = contenedor.querySelector('[data-form]');
    const input = contenedor.querySelector('[data-input]');

    let url;
    try { url = global.localStorage.getItem(CLAVE_SALA) || SALA_POR_DEFECTO; }
    catch { url = SALA_POR_DEFECTO; }

    const pintar = () => { urlEl.textContent = url; pintarQr(cajaQr, url); };

    contenedor.querySelector('[data-editar]').onclick = () => {
      form.hidden = !form.hidden;
      if (!form.hidden) { input.value = url; input.focus(); }
    };

    form.onsubmit = (e) => {
      e.preventDefault();
      url = input.value.trim() || SALA_POR_DEFECTO;
      try { global.localStorage.setItem(CLAVE_SALA, url); } catch { /* modo privado: da igual */ }
      form.hidden = true;
      pintar();
    };

    pintar();
  };

  // ---------- montaje ----------

  CL.montarDemos = function () {
    document.querySelectorAll('[data-demo]').forEach((section) => {
      const nombre = section.dataset.demo;
      const contenedor = section.querySelector('.demo');
      if (demos[nombre] && contenedor) demos[nombre](contenedor);
    });
  };
})(window);
