# Loader notes — opencode v2.0.1 TUI plugins (verified 2026-09-15, pty smokes)

## Which config is live
- `~/.config/opencode/cli.json` `plugins` is the LIVE path. A/B proven:
  `cli.json=[@hxnnxs/opencode-voice]` banners, `cli.json=[]` + `tui.json=[same]` is silent.
- `tui.json` `plugin` is DEAD in v2.0.1 (legacy, ignored). Do not document it for V2.

## What the loader accepts (npm specs only)
- File specs (`/abs/path`, `file://...`, `[path, opts]` tuples) in either file are
  silently ignored — no banner, no load. Local testing must go through the
  `~/.cache/opencode/npm/<spec>/` copy (back it up first, restore after).
- Live copy: `~/.cache/opencode/npm/@hxnnxs/opencode-voice@latest/<ts>/node_modules/...`
  (NOT `packages/`). Disk-write markers proved the import.
- `exports["./tui"]` may point at `.ts` (bun runtime handles it).

## Shape + runtime gotchas
- `Plugin.define({id, setup})` passes validation. `{id, tui}` (V1) fails the V2
  check with the user-facing `Invalid V2 TUI plugin module` / `Plugin failed` banner.
- `ctx.keymap.layer()` MUST run inside Solid component context, else setup throws
  `Keymap.Provider is missing` and init fails. Register it from
  `ctx.ui.slot({append:"app", render})`. `ctx.storage.store` and `ctx.ui.toast`
  are safe directly in `setup`.
- V1 `{id,tui}` fails at init on the v2 host (not just validation), so a V1-compat
  shim is not a shortcut — full port required (done in `src/`).

## Verified end state (cache-swapped fork, real npm path)
- `plugin failed: 0`; palette shows Voice: record/submit/stop; startup model picker renders.
- Record key default is now `ctrl+space` (one-time migrate off `ctrl+r`).
