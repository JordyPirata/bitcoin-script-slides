# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Qué es

Deck proyectable de 16 diapositivas sobre Bitcoin Script, con una máquina de pila interactiva como
pieza central. Es la charla que antecede a la demo presencial [candado-lan](../candado-lan): la
la última proyecta el QR de esa sala. Lee `README.md` para el guion y los atajos.

**El código está en español** (comentarios, UI, salida de los tests) y `README.md` / `CLAUDE.md` en
inglés. Mantén cada cosa en su idioma: código nuevo y textos que ve el público, en español;
documentación de nivel repo, en inglés.

## Comandos

```bash
./build-vendor.sh    # o npm run vendor — genera vendor/ (lo único que toca la red)
npm test             # node test/smoke.mjs — parser, opcodes y criptografía real
```

`package.json` existe solo para declarar esos scripts, la licencia y `engines: node >=18`: **no hay ni
una dependencia**, ni de runtime ni de desarrollo, y no hay linter. No añadas ninguna — la ausencia de
build es parte del diseño: hay que poder presentar sin internet, en una laptop prestada.

`vendor/` **no está versionado**. `build-vendor.sh` copia de `../candado-lan/public/vendor/` si existe
y solo descarga cuando no; es idempotente y acepta `--force`. Si falta, el deck lo detecta al cargar y
pinta en pantalla el comando exacto en vez de fallar a medias.

`smoke.mjs` no tiene filtro de tests: para correr solo una parte, comenta las llamadas del final.

## Arquitectura

**Un solo `index.html` con las 16 diapositivas como `<section>`.** No hay router ni carga dinámica: el
deck entero cabe en memoria y así funciona con `file://`, que es como se presenta.

### Cliente (`js/`, todo en el namespace global `CL`, sin módulos ES)

Los archivos se cargan como `<script>` en orden desde `index.html` y cada uno cuelga funciones de
`window.CL`. Ese orden (`vendor/*` → `keys.js` → `vm.js` → `vm-ui.js` → `demos.js` → `deck.js`) es una
dependencia real; `loadClient()` en `smoke.mjs` replica el prefijo sin DOM.

| Archivo | Responsabilidad |
|---|---|
| `keys.js` | Llave efímera secp256k1, `hash160`, firma, verificación, `selfTest()`. Sin DOM |
| `vm.js` | `parse()`, la tabla `OPS`, `buildOps()`, `runScript()` y `createRunner()`. Sin DOM |
| `vm-ui.js` | Cinta + pila + controles. Un widget por `<section data-demo>` |
| `demos.js` | Cablea cada diapositiva interactiva con su script y su contexto |
| `deck.js` | Navegación por teclado, hash, barra de progreso, atajos |

**La separación DOM / sin DOM es una regla, no una casualidad.** `keys.js` y `vm.js` no pueden tocar
el DOM al cargar: si lo hacen, `smoke.mjs` deja de poder cargarlos y el motor se queda sin pruebas.

Detalles con consecuencias:

- **`step()` devuelve un frame, no solo el resultado.** El resto de la interfaz de `createRunner()` es
  idéntica a la de candado-lan (`ops`, `index`, `stack`, `finished`, `result`, `reset`) a propósito:
  el CSS y el render se copian entre los dos repos sin adaptación. Si cambias esos nombres, rompes esa
  propiedad.
- **Los `*VERIFY` abortan** devolviendo `{failed, reason}` desde `run()`, y `OP_CHECKSIG` también.
  Bitcoin real apila `FALSE` y sigue. Es deliberado: la de los dos fallos enseña *qué* opcode mató el
  script, y el test `testP2PKH` comprueba el `failedAt`, no solo el `reason`. Si "arreglas" esto,
  cambias lo que enseña la charla.
- **Las simplificaciones criptográficas están documentadas** en la cabecera de `keys.js` y en el
  README: `hash160` en crudo sin Base58Check, y el mensaje firmado no es un sighash real. La
  diapositiva del sighash dice ambas cosas en voz alta. No las "corrijas" en silencio.
- **`→` avanza un opcode antes que una diapositiva.** `deck.js` pregunta a `CL.vmui.runnerFor(section)`
  y solo pasa de diapositiva cuando no hay máquina a medias. Un `<details>` cerrado no cuenta como
  visible: se comprueba con `checkVisibility()`, porque `offsetParent` sigue siendo válido ahí.
- **Solo se pinta la diapositiva activa** (`.slide.on`), y `body` tiene `overflow:hidden`. Por eso la
  barra espaciadora no hace scroll y no se puede quedar a medio camino entre dos diapositivas.

### Estilo

`css/theme.css` es una copia literal de la paleta de candado-lan: **no se edita aquí**. Todo lo nuevo
va en `deck.css`. Tres acentos y solo tres: `--amber` opcodes y primario, `--verdigris` datos y éxito,
`--rust` fallo y aborto. Todos los bordes de 1px en `--rule`. Las clases de script y pila (`.op`,
`.data`, `.tape`, `.op-row`, `.stack-item`, `.result`) tienen los mismos nombres que en candado-lan.

**La escala tipográfica mira el ancho y el alto** (`clamp(x, min(Nvw, Mvh), y)`). Un proyector de
1280×720 es ancho y bajo: con solo `vw`, la de los dos fallos se sale por abajo justo en la resolución
para la que está pensada. Si añades contenido a una diapositiva, comprueba que sigue cabiendo a
1280×720 con la máquina ejecutada del todo.

**El objetivo es el proyector, y solo el proyector.** No hay diseño para pantallas estrechas ni gestos
táctiles, a propósito.
