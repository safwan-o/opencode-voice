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

## V1 appendix (dual-version package, 0.5.0 track)
- Config: `opencode plugin <spec>` writes the project (default) or global
  (`-g`) config `plugin` array (`Config.plugin: Array<string | [string, PluginOptions]>`).
  **That array feeds the server loader only** — a TUI-only package listed
  there fails with `must default export an object with server()`.
- TUI plugins load from `tui.json` `plugin` (global
  `~/.config/opencode/tui.json` + project `.opencode/tui.json`, merged), and
  **only as file entries**: npm specs are skipped for the TUI host, so the
  published package name alone never loads the voice commands on V1.
- File-entry gate (verified by bisection against 1.18.31): a file plugin is
  silently skipped when its `package.json` `exports` map contains a `./tui`
  subpath. Our package needs `./tui` for V2, so V1 installs go through a
  shim dir — symlinks to the repo plus a minimal `package.json` (`name`,
  `version`, `type: module`, `main`; **no** `exports` map). See the README
  1.x tab for the exact commands. Symlinks track the working tree, so the
  shim always runs current repo code.
- Keep the shim `version` stable: changing it under a registered path keeps
  the loader's old verdict — re-run the `plugin` command to refresh.
- Entry: `main` → `./index.js`, shape `{id?, tui}` with no `server` key
  (`TuiPluginModule`, `@opencode-ai/plugin@1.18.31`).
- `api.keymap.registerLayer({priority, commands, bindings})` runs directly at
  init and returns a dispose fn — no Solid slot-render constraint (that
  `Keymap.Provider` gotcha is V2-only).
- Delivery is native: `client.tui.appendPrompt({text})` + `submitPrompt()`.
- Full contract table: `docs/v1-contract.md`.
