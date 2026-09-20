# V1 contract recon — gap table (Phase 0)

Pinned SDK: `@opencode-ai/plugin@1.18.31` (`dist/tui.d.ts`, `dist/index.d.ts`),
`@opencode-ai/sdk@1.18.31` (`dist/v2/gen/sdk.gen.d.ts`), `@opentui/keymap@0.5.11`
(`src/keymap.d.ts`, `src/types.d.ts`). Inspected from npm tarballs in `/tmp`
(not committed). Upstream install baseline: `ihxnnxs/opencode-voice@v0.2.3` README.

## V1 module + loader

| Item | V1 actual | V2 actual | Decision |
|---|---|---|---|
| Module shape | `{ id?, tui }`, `tui: (api, options?, meta?) => Promise<void>` (`TuiPluginModule`) | `Plugin.define({id, setup})` | Keep both entries: `main → ./index.js` (V1), `./tui → src/tui.ts` (V2) |
| Install | `opencode plugin <spec>` → global config `plugin` array (`Config.plugin: Array<string \| [string, PluginOptions]>`) | `cli.json` npm specs only; file specs ignored | Docs get per-version install tabs |
| Plugin options | `[spec, options]` tuple → `options: PluginOptions` | `cli.json` entry options → `ctx.options` | Same overlay keys both versions |
| `server` key | Must be absent (`server?: never`) | n/a | Already absent in `index.js` |

## Call-site map (`index.js` → V1 API)

| `index.js` use | V1 equivalent | Status |
|---|---|---|
| `api.kv.get/set` (`readSettings`, `writeSetting`) | `TuiKV { get, set, ready }` | ✓ exists |
| `api.ui.toast({title, message, variant})` | `TuiToast { variant?, title?, message, duration? }` | ✓ exists |
| `ui.dialog.setSize/replace/clear` | `TuiDialogStack { setSize, replace, clear, ... }` | ✓ exists |
| `DialogAlert/DialogSelect/DialogPrompt` | Same names; Select has `current/options{title,value,description,footer?,category?,disabled?}`; Prompt has `value/placeholder/onConfirm/onCancel` | ✓ exists (V1 has unused extras: `busy`, `onMove`, `onFilter`) |
| `api.keymap.registerLayer({priority, commands, bindings})` → dispose fn | `Keymap.registerLayer(layer: Layer): () => void`; `Layer { target?, priority?, bindings?, commands? }` | ✓ exists |
| `api.lifecycle.onDispose` | `TuiLifecycle { signal, onDispose }` | ✓ exists |
| `client.tui.appendPrompt({text})` | `Tui.appendPrompt({ directory?, workspace?, text? })` | ✓ exists |
| `client.tui.submitPrompt()` | `Tui.submitPrompt({ directory?, workspace? })` | ✓ exists |
| Legacy `api.command` | Optional, deprecated | Not used — no action |

## Settings store

| Item | V1 actual | V2 actual | Decision |
|---|---|---|---|
| Store | `api.kv` string keys (`voice.*`, `index.js:6-20`) | `ctx.storage.store("settings", ...)` (`src/tui.ts:23-28`) | Divergent, no cross-version migration |
| New keys | KV lacks `voiceEnhance`, `cleanupCutoffHz`, `hotkeyMigratedV2` (engine already honors them, `lib/engine.js:942`) | Present via `src/settings.ts` | Extend V1 KV with read-through defaults |
| Defaults home | `DEFAULT_SETTINGS`, `lib/models.js:251-252` (`recordingHotkey: "ctrl+r"`) | Overrides to `ctrl+space` in `src/settings.ts:20` | Single-source in `lib/`, flip to `ctrl+space` |

## Go / no-go answers

- **`ctrl+r` conflict on V1: UNVERIFIED.** V1 default keybinds live in the OpenCode app
  binary, not in any published package inspected here. Upstream default was `ctrl+r`.
  Decision stands regardless (owner-locked): unify both versions on `ctrl+space`
  with explicit-key-preserving migration — one default, one docs story.
- **V1 loader accepts this package's `main` entry: YES.** Shape `{id, tui}`,
  no `server` key, pure JS (Node 20-capable; package floor stays `>=22` by owner decision).
- **V1 `appendPrompt` insertion: YES**, with optional `directory`/`workspace` scoping
  we don't currently pass (single-session assumption preserved).

## Sources
- `package/dist/tui.d.ts`, `package/dist/index.d.ts` in `@opencode-ai/plugin@1.18.31`
- `sdk/package/dist/v2/gen/sdk.gen.d.ts` (`Tui.appendPrompt`/`submitPrompt`) in `@opencode-ai/sdk@1.18.31`
- `keymap/package/src/keymap.d.ts`, `src/types.d.ts` in `@opentui/keymap@0.5.11`
- `https://raw.githubusercontent.com/ihxnnxs/opencode-voice/v0.2.3/README.md`
  (install lines 34/159, `ctrl+r` default line 56, entrypoint line 164)
