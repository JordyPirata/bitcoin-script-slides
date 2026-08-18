/* Criptografía del deck: par de llaves secp256k1 -> hash160.
   Todo lo que ejecuta OP_CHECKSIG en estas diapositivas es real: firma ECDSA de
   verdad, verificada de verdad. Cuando alguien pregunta "¿eso está comprobando
   algo?", la respuesta tiene que poder ser que sí.

   No hay BIP39 aquí (candado-lan sí lo tiene, y por eso necesita bundlear npm):
   el deck genera una llave nueva en cada carga de la página. Cada charla firma
   con llaves distintas y nadie tiene que teclear nada.

   Dos simplificaciones deliberadas, heredadas de candado-lan, que hay que decir
   en voz alta durante la charla en vez de disimular:

   1. El hash160 se muestra en crudo: no es una dirección. Una dirección P2PKH real
      es Base58Check sobre ese mismo hash — byte de versión + 4 bytes de checksum +
      alfabeto Base58 -> 1A1zP1… Aquí se ve el hash tal y como lo compara
      OP_EQUALVERIFY, que es justo el punto del P2PKH.

   2. Lo que se firma NO es un sighash de Bitcoin. Es un texto didáctico
      ("gasto:…|para:…") con un solo SHA-256. Un sighash real serializa la
      transacción con reglas de SIGHASH_ALL y aplica doble SHA-256. La diapositiva del sighash
      explica precisamente eso, así que ahí se dice que este mensaje es un sustituto:
      la mecánica de "la firma cubre un mensaje construido, no la tx entera" es la
      misma, la serialización no. */
(function (global) {
  'use strict';

  const CL = (global.CL = global.CL || {});
  if (CL.sinVendor) return;   // el aviso de index.html ya está en pantalla

  const ec = new global.elliptic.ec('secp256k1');
  const CJS = global.CryptoJS;

  CL.ec = ec;

  CL.sha256hex = (hex) => CJS.SHA256(CJS.enc.Hex.parse(hex)).toString();
  CL.sha256utf8 = (str) => CJS.SHA256(CJS.enc.Utf8.parse(str)).toString();
  CL.ripemd160hex = (hex) => CJS.RIPEMD160(CJS.enc.Hex.parse(hex)).toString();
  CL.hash160 = (hex) => CL.ripemd160hex(CL.sha256hex(hex));

  /** Acorta un hex largo para que quepa en pantalla sin perder identificabilidad. */
  CL.short = (hex, n = 8) =>
    typeof hex === 'string' && hex.length > 2 * n ? hex.slice(0, n) + '…' + hex.slice(-n) : hex || '';

  /* Los 32 bytes salen de WebCrypto y no de elliptic.genKeyPair(): su generador
     (brorand) se queda sin fuente de entropía cuando el archivo se carga fuera de un
     navegador, que es justo como lo cargan los tests. */
  const azar32 = () => {
    const bytes = new Uint8Array(32);
    global.crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  };

  /**
   * Una llave nueva, sin origen ni respaldo: vive lo que dura la página.
   * @param {string} [privHex] fija la llave (útil para reproducir un caso concreto)
   */
  CL.ephemeralKey = function (privHex) {
    let escalar = privHex;
    // El escalar tiene que caer dentro del orden de la curva. Nunca falla, pero
    // salir por un descarte es más barato que explicar por qué no hace falta.
    while (!escalar || ec.keyFromPrivate(escalar, 'hex').getPrivate().cmp(ec.curve.n) >= 0) {
      escalar = azar32();
    }
    const key = ec.keyFromPrivate(escalar, 'hex');
    const pubHex = key.getPublic(true, 'hex');   // comprimida
    return { privHex: key.getPrivate('hex'), pubHex, pkh: CL.hash160(pubHex), key };
  };

  /** El mensaje que firma quien gasta. Determinista: cualquiera lo recalcula. */
  CL.spendMessage = (pkh, nota) => `gasto:${pkh}|${nota || 'demo'}`;

  /** Firma un texto: sha256(utf8) y ECDSA canónica, devuelta en DER hex. */
  CL.signMessage = function (identity, message) {
    const msgHash = CL.sha256utf8(message);
    const sigDer = identity.key.sign(msgHash, { canonical: true }).toDER('hex');
    return { msgHash, sigDer };
  };

  /** Rompe una firma a propósito, para demostrar que OP_CHECKSIG lo detecta. */
  CL.tamperSignature = function (sigDer) {
    const tail = sigDer.slice(-4);
    return sigDer.slice(0, -4) + (tail === '0000' ? '1111' : '0000');
  };

  CL.verifySignature = function (pubHex, msgHash, sigDer) {
    try {
      return ec.keyFromPublic(pubHex, 'hex').verify(msgHash, sigDer);
    } catch {
      return false; // DER corrupta: para el script es exactamente lo mismo que una firma falsa
    }
  };

  /**
   * Vectores conocidos + roundtrip. Si esto falla en la laptop prestada, mejor
   * enterarse mientras se conecta el proyector y no en mitad del P2PKH.
   */
  CL.selfTest = function () {
    const checks = [];
    const push = (name, ok, detail) => checks.push({ name, ok, detail: detail || '' });

    push('SHA-256 (vector vacío)',
      CL.sha256utf8('') === 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');

    // hash160 de la pubkey del bloque génesis -> el hash160 de la dirección 1A1zP1...
    const genesisPub = '04678afdb0fe5548271967f1a67130b7105cd6a828e03909a67962e0ea1f61deb6' +
      '49f6bc3f4cef38c4f35504e51ec112de5c384df7ba0b8d578a4c702b6bf11d5f';
    push('HASH160 (pubkey del bloque génesis)',
      CL.hash160(genesisPub) === '62e907b15cbf27d5425399ebf6f0fb50ebb88f18');

    const id = CL.ephemeralKey();
    const { msgHash, sigDer } = CL.signMessage(id, CL.spendMessage(id.pkh, 'prueba'));
    push('Firma y verificación', CL.verifySignature(id.pubHex, msgHash, sigDer));
    push('Firma alterada se rechaza', !CL.verifySignature(id.pubHex, msgHash, CL.tamperSignature(sigDer)));
    push('Otra llave no valida la firma', !CL.verifySignature(CL.ephemeralKey().pubHex, msgHash, sigDer));

    return { checks, ok: checks.every((c) => c.ok) };
  };
})(window);
