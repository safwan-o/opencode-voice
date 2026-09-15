# Phase3 plan — full V2 port (branch `feat/phase3-v2-port`)

## V2 API decisions (verified against `@opencode/plugin@2.0.3` + `anomalyco/opencode` TUI source)
- Entry: `Plugin.define({id:"opencode-voice", setup(ctx)})`, `./tui -> ./src/tui.ts`. V1 `index.js` untouched (dual compat).
- Settings: `ctx.storage.store("settings", {initial})` -> `[store, update]`; `update(d => {...})`. Normalization rules copied from V1 `readSettings`.
- Keymap: `ctx.keymap.layer(() => ({mode:"global", priority:100, commands, bindings}))`, returns void (auto-disposed). Per-command `bind` carries hotkey; `bind:false` when empty.
- Dialogs: promise APIs — `select` -> value|undefined, `prompt` -> string|undefined, `alert`, `confirm`. Callback-style `DialogSelect/onSelect` flows rewritten as async loops.
- Toasts: `ctx.ui.toast.show({title:"Voice", message, variant})`.
- Progress: toasts only (no JSX progress panels; deferred to Phase4).
- Cleanup: `return () => runtime.cancel()` from `setup`.
- `lib/*` unchanged (pure + sidecar logic reused as-is).

## Known V2 limitation (documented, not silent)
V2 CLI API has NO composer-append: `ctx.client` has no `tui.appendPrompt`; `tui.prompt.append`
is consumed by the TUI prompt component (`packages/tui/src/component/prompt/index.tsx:237`)
with no publisher API for CLI plugins (rechecked against `@opencode/plugin@2.0.3` + CLI docs).
So delivery = review-before-send: `submit`/`autoSubmit` sends via `session.prompt` immediately,
otherwise a `dialog.prompt` prefilled with the transcription (confirm submits, cancel discards).
Outside a session, text is shown in an alert dialog. True append returns if upstream adds a composer API.

## Slices (commits, one PR after full gate)
- 3a `src/settings|formatters|languages.ts` — pure, unit-tested.
- 3b `src/ensure.ts` + `src/voice.ts` — record/transcribe controller, injectable deps, unit-tested.
- 3c `src/dialogs.ts` — settings pickers/manager flows.
- 3d `src/tui.ts` wiring + `test/tui-v2.test.js` + gate + PR.

## Gate (must pass before PR)
`npm test`, `node --check` all JS, V1 shape intact, V2 shape `{id,setup}`, mock-ctx
setup/cleanup + toggle→`session.prompt` + settings-update tests, `npm pack --dry-run` has `src/`.
