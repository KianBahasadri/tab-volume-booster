# AGENTS.md

A standalone Firefox Manifest V3 extension for adjusting the volume of compatible HTML audio and video players from 0% to 600% per tab.

## Rules

- **Keep this repo KISS as fuck: stupid easy to use and boring to maintain. Complexity alone is enough to veto an idea.**
  - **Push back before coding:** If a requested feature introduces disproportionate architectural complexity or state, flag it and propose the simplest viable alternative before writing code.
  - **No legacy support:** Replace old behavior cleanly—never keep fallback paths, shims, or backwards-compatibility layers. If compatibility is actually needed, ask me first.
  - **Prefer stdlib and existing dependencies:** Do not introduce a new package for something solvable in under 50 lines of straightforward code.
  - **Flat and explicit over clever:** Use plain functions, direct control flow, and concrete types. Do not create wrappers, factories, or interfaces that only have one implementation.
  - **No speculative extensibility:** Do not add config flags, plugin hooks, or abstraction layers for hypothetical future use cases.
- Keep the extension self-contained at the repo root with zero external dependencies, zero build step, zero external network requests, and minimal Firefox permissions.
- Commit and push changes to the remote branch when a major change is completed.

## Documentation (read/write)

- **Read first:** For how this repo works, start at `docs/README.md`, then
  open only the topic files you need. Do not re-derive behavior from
  filenames alone when a doc covers it.
- **Before non-trivial changes:** Check the relevant doc so you match
  existing patterns.
- **After behavior changes:** Update the **one** topic file under `docs/`
  that owns that fact. Do not copy the same detail into AGENTS.md,
  README.md, or multiple docs.
- **Regenerate vs patch:** `docs/README.md` records the commit it was
  generated from; `git diff <sha>..HEAD --stat` shows what changed since.
  Prefer the `generate_docs` skill when docs are broadly stale or many
  topics shifted; for small, targeted edits, patch the single topic file
  (and `docs/README.md` if you add/remove a topic).
- `CLAUDE.md` is a symlink to this file.

Do not put implementation detail in this file — it lives under `docs/`.
