/* Prueba de humo: el parser, la tabla de opcodes y la criptografía real.
   Uso: node test/smoke.mjs          (no necesita navegador ni npm install)

   No hay filtro de tests: para correr solo una parte, comenta las llamadas del final. */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

let failures = 0;
function check(name, cond, detail) {
  if (cond) { console.log(`  ✔ ${name}`); } else { failures++; console.log(`  ✘ ${name}${detail ? ' — ' + detail : ''}`); }
}

/* Los archivos de js/ no exportan nada: son IIFE que cuelgan de window.CL. Se finge
   el global del navegador y se cargan en el mismo orden que index.html. vm-ui.js,
   demos.js y deck.js quedan fuera a propósito: tocan el DOM al arrancar. */
function loadClient() {
  const vendor = path.join(ROOT, 'vendor');
  if (!fs.existsSync(path.join(vendor, 'elliptic.min.js'))) {
    console.log('\nFalta vendor/. Córrelo primero:\n\n  npm run vendor\n');
    process.exit(1);
  }
  globalThis.window = globalThis;
  globalThis.elliptic = require(path.join(vendor, 'elliptic.min.js'));
  globalThis.CryptoJS = require(path.join(vendor, 'crypto-js.min.js'));
  require(path.join(ROOT, 'js/keys.js'));
  require(path.join(ROOT, 'js/vm.js'));
  return globalThis.CL;
}

const CL = loadClient();

// ---- Criptografía --------------------------------------------------------

function testCripto() {
  console.log('\nCriptografía:');
  const { checks, ok } = CL.selfTest();
  for (const c of checks) check(c.name, c.ok);
  check('autodiagnóstico completo', ok);

  const a = CL.ephemeralKey();
  const b = CL.ephemeralKey();
  check('dos llaves efímeras son distintas', a.privHex !== b.privHex);
  check('el pkh son 40 hex', /^[0-9a-f]{40}$/.test(a.pkh), a.pkh);
}

// ---- Parser --------------------------------------------------------------

function testParser() {
  console.log('\nParser:');
  const tokens = CL.parse('2 3 OP_ADD <sig>');
  check('el entero se apila como número', tokens[0].push.value === 3 - 1);
  check('el opcode se reconoce', tokens[2].op === 'OP_ADD');
  check('el <placeholder> guarda su nombre', tokens[3].push.ref === 'sig');

  let lanzo = false;
  try { CL.parse('2 OP_INVENTADO'); } catch { lanzo = true; }
  check('un opcode desconocido revienta al parsear', lanzo);

  let faltante = false;
  try { CL.buildOps('<noexiste> OP_DUP', {}); } catch { faltante = true; }
  check('un <placeholder> sin contexto revienta al montar', faltante);
}

// ---- Aritmética: el primer script ---------------------------------------

function testAritmetica() {
  console.log('\nAritmética (el primer script):');
  check('2 3 OP_ADD 5 OP_EQUAL termina en TRUE', CL.runScript('2 3 OP_ADD 5 OP_EQUAL', {}).ok);
  check('2 3 OP_ADD 6 OP_EQUAL termina en FALSE', !CL.runScript('2 3 OP_ADD 6 OP_EQUAL', {}).ok);

  const r = CL.runScript('2 3 OP_ADD 6 OP_EQUAL', {});
  check('OP_EQUAL no aborta: llega al final del script', r.failedAt === 4, `failedAt=${r.failedAt}`);

  check('OP_DUP duplica', CL.runScript('7 OP_DUP OP_EQUAL', {}).ok);
  // Tras el swap el 2 queda debajo; si OP_SWAP no hiciera nada, OP_DROP tiraría el 2.
  check('OP_SWAP intercambia', CL.runScript('1 2 OP_SWAP OP_DROP 2 OP_EQUAL', {}).ok);
  check('pila insuficiente aborta', CL.runScript('OP_ADD', {}).reason === 'stack-vacia');
}

// ---- P2PKH: el acordeón y los dos fallos --------------------------------

const P2PKH = '<sig> <pubkey> OP_DUP OP_HASH160 <pkh> OP_EQUALVERIFY OP_CHECKSIG';

function contextoP2PKH(firmante, candado) {
  const mensaje = CL.spendMessage(candado.pkh, 'diapositiva');
  const { msgHash, sigDer } = CL.signMessage(firmante, mensaje);
  return { sig: sigDer, pubkey: firmante.pubHex, pkh: candado.pkh, msgHash };
}

function testP2PKH() {
  console.log('\nP2PKH (el acordeón y los dos fallos):');
  const dueno = CL.ephemeralKey();
  const impostor = CL.ephemeralKey();

  check('la llave correcta abre el candado', CL.runScript(P2PKH, contextoP2PKH(dueno, dueno)).ok);

  /* Regresión de la diapositiva de los dos fallos: los dos fallos tienen que ser distinguibles.
     Si OP_EQUALVERIFY degenerara en apilar FALSE y seguir, la diapositiva dejaría de
     enseñar lo que enseña — por eso se comprueba también dónde muere, no solo que muera. */
  const conImpostor = CL.runScript(P2PKH, contextoP2PKH(impostor, dueno));
  check('la llave del impostor muere en OP_EQUALVERIFY', conImpostor.reason === 'wrong-key', conImpostor.reason);
  check('y muere en ese opcode, no al final del script', conImpostor.failedAt === 5, `failedAt=${conImpostor.failedAt}`);

  const ctx = contextoP2PKH(dueno, dueno);
  const conFirmaRota = CL.runScript(P2PKH, { ...ctx, sig: CL.tamperSignature(ctx.sig) });
  check('la firma alterada muere en OP_CHECKSIG', conFirmaRota.reason === 'bad-sig', conFirmaRota.reason);
  check('y muere en el último opcode', conFirmaRota.failedAt === 6, `failedAt=${conFirmaRota.failedAt}`);

  check('los dos fallos dan textos distintos',
    CL.reasonText('wrong-key') !== CL.reasonText('bad-sig'));
}

// ---- Multisig y locktime: el acordeón y los candados que esperan --------

const MULTISIG = '<dummy> <sig1> <sig2> 2 <pub1> <pub2> <pub3> 3 OP_CHECKMULTISIG';

function testFamilia() {
  console.log('\nMultisig y locktime:');
  const socios = [CL.ephemeralKey(), CL.ephemeralKey(), CL.ephemeralKey()];
  const mensaje = CL.spendMessage(socios[0].pkh, 'tesorería');
  const firmas = socios.map((s) => CL.signMessage(s, mensaje));

  const base = {
    dummy: '00', msgHash: firmas[0].msgHash,
    pub1: socios[0].pubHex, pub2: socios[1].pubHex, pub3: socios[2].pubHex,
  };

  check('2 de 3 con dos firmas buenas abre',
    CL.runScript(MULTISIG, { ...base, sig1: firmas[0].sigDer, sig2: firmas[2].sigDer }).ok);

  const desordenadas = CL.runScript(MULTISIG, { ...base, sig1: firmas[2].sigDer, sig2: firmas[0].sigDer });
  check('las firmas fuera de orden fallan', desordenadas.reason === 'multisig-fail', desordenadas.reason);

  const unaRota = CL.runScript(MULTISIG, {
    ...base, sig1: firmas[0].sigDer, sig2: CL.tamperSignature(firmas[2].sigDer),
  });
  check('con una firma rota no llega a 2 de 3', unaRota.reason === 'multisig-fail', unaRota.reason);

  const CLTV = '500000 OP_CHECKLOCKTIMEVERIFY OP_DROP 1';
  check('el candado sigue cerrado antes del bloque',
    CL.runScript(CLTV, { blockHeight: 499999 }).reason === 'locktime-no-cumplido');
  check('y se abre después del bloque', CL.runScript(CLTV, { blockHeight: 500001 }).ok);
}

// ---- El runner paso a paso ----------------------------------------------

function testRunner() {
  console.log('\nRunner paso a paso:');
  const r = CL.createRunner('2 3 OP_ADD 5 OP_EQUAL', {});
  check('arranca vacío y sin resultado', r.index === 0 && r.stack.length === 0 && r.result === null);

  const f1 = r.step();
  check('el primer frame dice qué se apiló', f1.pushed.length === 1 && f1.popped.length === 0);
  check('y no hay resultado todavía', f1.result === null);

  r.step();
  const suma = r.step();
  check('OP_ADD saca dos y mete uno', suma.popped.length === 2 && suma.pushed.length === 1, JSON.stringify(suma.pushed));
  check('el frame trae el nombre del opcode', suma.op === 'OP_ADD');

  r.step();
  const fin = r.step();
  check('el último frame trae el resultado', fin.result && fin.result.ok === true);
  check('el runner queda terminado', r.finished);
  check('step() después del final no hace nada', r.step() === null);

  r.reset();
  check('reset() lo deja como nuevo', r.index === 0 && r.stack.length === 0 && !r.finished);

  const dueno = CL.ephemeralKey();
  const paso = CL.createRunner(P2PKH, { context: contextoP2PKH(dueno, dueno) });
  check('la cinta de P2PKH tiene 7 pasos', paso.ops.length === 7, String(paso.ops.length));
  check('cada paso trae su descripción en pantalla', paso.ops.every((o) => o.name && o.desc));
  while (!paso.finished) paso.step();
  check('paso a paso llega al mismo TRUE que runScript', paso.result.ok);
}

testCripto();
testParser();
testAritmetica();
testP2PKH();
testFamilia();
testRunner();

console.log(failures === 0 ? '\nTodo en orden.\n' : `\n${failures} comprobación(es) fallaron.\n`);
process.exit(failures === 0 ? 0 : 1);
