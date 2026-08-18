# Bitcoin Script — slides

A 20–30 minute talk about Bitcoin Script, built around a stack machine you actually run on stage.
Type `2 3 OP_ADD 5 OP_EQUAL`, press `→`, and the room watches the stack fill up one opcode at a time.
Then the same machine runs a real P2PKH lock — real secp256k1 keys, generated when the page loaded,
a real signature, really verified — and then watches it die at `OP_EQUALVERIFY` when the wrong person
tries to open it.

Sixteen slides. No build step, no dependencies at runtime, no server. You open `index.html` and talk.

> **Heads-up on language:** everything the audience sees is in Spanish, and so are the code comments
> and the test output. Repo-level documentation — this file and `CLAUDE.md` — is in English. Same
> convention as [candado-lan](../candado-lan), which this deck is the opening act for.

## Requirements

- A Chromium- or Firefox-based browser. That's it to present.
- `bash` and `curl` for `build-vendor.sh`, and network access **once** — unless candado-lan already
  ran on this machine, in which case it is a local copy and needs no network at all.
- Node ≥ 18, only if you want to run the tests.

## Quick start

```bash
./build-vendor.sh          # vendors elliptic, crypto-js, qrcode and three woff2 families
xdg-open index.html        # or just open the file:// URL by hand
```

There is no `npm install`, because there is nothing to install. `package.json` exists to declare two
scripts and the license.

## Presenting

| Key | What it does |
|---|---|
| `→` / `space` | Next **opcode** if the current slide has a machine mid-run; otherwise the next slide |
| `←` | Previous slide |
| `Home` / `End` | First / last slide |
| `r` | Reset the machine on this slide |
| `?` | Show the shortcuts |

That first row is the whole point of writing the navigation by hand: you drive the entire talk,
animations included, without ever reaching for the mouse. There is deliberately no click-to-advance and
no timer: in front of a room, every extra way to move the deck is an extra way to move it by accident.
A presenter remote sends `PageUp`/`PageDown`, which are bound.

The slide index lives in `location.hash`, so `index.html#10` opens straight at the lock family and reloading
never loses your place.

**Before you go on stage:** open slide 16 and set the room URL with *✎ Cambiar la URL de la sala*.
That is the address candado-lan prints when it starts, and it changes every time you present. The QR
is generated in the browser and the URL is remembered in `localStorage`.

## The stack machine

`js/vm.js` is a small, general Script interpreter: a script is a string, it gets tokenised on spaces,
and a table of opcodes does the rest. Three token forms — an integer, an `OP_*`, and a `<placeholder>`
resolved against a context object — which is enough to run every script in the deck through the same
code path.

```js
CL.parse('<sig> <pubkey> OP_DUP OP_HASH160 <pkh> OP_EQUALVERIFY OP_CHECKSIG');
const r = CL.createRunner(script, { context });
r.step();   // -> { op, desc, popped, pushed, failed, reason, result }
```

Implemented opcodes: `OP_DUP`, `OP_DROP`, `OP_SWAP`, `OP_ADD`, `OP_EQUAL`, `OP_EQUALVERIFY`,
`OP_SHA256`, `OP_HASH160`, `OP_CHECKSIG`, `OP_CHECKMULTISIG`, `OP_CHECKLOCKTIMEVERIFY`.

The runner deliberately keeps candado-lan's `createRunner()` shape — `ops`, `index`, `stack`,
`finished`, `result`, `reset()`, `step()` — so rendering code and CSS move between the two repos
unchanged. The one extension is that `step()` returns a frame describing what was pushed and popped,
which is what the animation needs.

## Deliberate simplifications

The cryptography is real. The interpreter is not a Bitcoin node, and pretending otherwise would be
worse than saying so. **Do not use this as a reference for anything that touches real money.**

- **Not consensus-compatible.** No signed little-endian number encoding, no 520-byte element limit,
  no sigop counting, and roughly a hundred opcodes are missing. It is teaching material.
- **`OP_CHECKSIG` and `OP_CHECKMULTISIG` abort on failure** instead of pushing `FALSE` and carrying
  on, which is what a real node does. This is inherited from candado-lan and it is the whole reason
  slide 13 lands: the audience sees *which* opcode killed the script, and that a `*VERIFY` failure and
  a signature failure are different events.
- **What gets signed is not a sighash.** It is a short deterministic string, hashed once with SHA-256.
  A real signature covers a serialised subset of the transaction hashed twice under `SIGHASH_ALL`.
  Slide 12 exists to explain that, and says out loud that the deck substitutes it.
- **`OP_CHECKLOCKTIMEVERIFY` compares against a `blockHeight` in the context**, not against the
  spending transaction's `nLockTime` and input sequence. The idea survives; the plumbing doesn't.
- **`hash160` is shown raw.** No Base58Check, no version byte, no checksum — so what you see on screen
  is exactly what `OP_EQUALVERIFY` compares. Same call as candado-lan, for the same reason.
- **Projector only.** The layout targets 1280×720 and up. It is not designed for narrow screens and
  will look cramped on a phone.

## Layout

| File | What it does |
|---|---|
| `index.html` | The whole deck: one `<section>` per slide, plus the vendor check |
| `js/vm.js` | Parser, opcode table, `runScript()` and `createRunner()`. No DOM |
| `js/keys.js` | Ephemeral secp256k1 keys, `hash160`, signing, verification, `selfTest()`. No DOM |
| `js/vm-ui.js` | Renders the tape and the stack, step by step |
| `js/demos.js` | Wires each `<section data-demo>` to its script and context |
| `js/deck.js` | Navigation, progress bar, shortcuts |
| `css/theme.css` | The palette, copied verbatim from candado-lan. Don't edit it here |
| `css/deck.css` | Slide layout and the projector type scale |
| `build-vendor.sh` | Copies from candado-lan if present, downloads otherwise. The only step that touches the network |

Scripts are plain `<script>` tags hanging off a global `CL`, loaded in dependency order. There are no
ES modules and no exports — that is what lets the test load the same files in Node.

## Tests

```bash
npm test        # node test/smoke.mjs
```

No framework. It fakes `window`, `require()`s the vendor bundles and the two DOM-free files in the
same order `index.html` does, and checks the parser, the opcode table and the real signatures. The
regression that matters is in `testP2PKH`: the wrong key must abort *at `OP_EQUALVERIFY`*, not at the
end of the script. If that ever stops being true, slide 13 stops teaching what it teaches.

`vm-ui.js`, `demos.js` and `deck.js` are not loaded by the test — they touch the DOM. Keep it that
way: logic goes in `vm.js`, rendering goes everywhere else.

## Presentation day

- Run `./build-vendor.sh` and open the deck **once** on the actual laptop, before the room fills up.
  If `vendor/` is missing the deck says so and prints the command, but it says it on the projector.
- Set the room URL on slide 16 before you start, not while forty people watch you type an IP address.
- The keys are regenerated on every page load, so a reload mid-talk changes every hash on screen. If
  someone in the front row is copying them down, that is worth mentioning rather than hiding.
- To cut the talk to 20 minutes, skip slides 11 and 14. The thread survives. Slide 4 is the map the
  rest of the talk fills in — cut that one last.

## Contributing

Two-space indent, no transpiler, no framework, no dependencies. Spanish for code comments and anything
the audience reads; English for the docs. If you add an opcode, add it to the table in `vm.js` with its
`desc` — that string is projected, so write it for the room, not for the reader of the source.

## License

[MIT](LICENSE) © JordyPirata

> Teaching material. Not a Bitcoin implementation, not a security reference, and not something to
> derive real keys with.
