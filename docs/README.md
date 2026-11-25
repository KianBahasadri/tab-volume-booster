# Documentation

- [extension-architecture.md](extension-architecture.md) — Manifest V3 layout, permissions, background tab state, toolbar badge, and message flow.
- [cors-and-audio-routing.md](cors-and-audio-routing.md) — Cross-origin media header injection, `crossOrigin` reload/rollback, player discovery, Web Audio routing, and browser limits.
- [popup-ui.md](popup-ui.md) — Native toolbar popup, keyboard shortcut, theming, multi-frame status aggregation, and restricted pages.
- [tampermonkey-userscript.md](tampermonkey-userscript.md) — Historical record of the first Tampermonkey userscript approach (`v1.0.0`–`v1.1.0`) and the restrictions that forced the pivot to a Firefox extension.

_Generated from commit `5a9087c` (plus Firefox extension pivot) on 2026-11-25._

## Notes

- These docs are AI-generated, after-the-fact records of the current implementation rather than aspirational design specs.
- Do not repeat the same facts across files; each topic owns its details in one file and other docs should link to it.
- Experiments, dead-ends, and reverted approaches should get their own dedicated doc file if added later.
- Keep each doc file under ~400 lines; if a topic grows past that, split it by sub-topic and list each part here.
