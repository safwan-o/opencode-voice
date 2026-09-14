# V2 API inventory (Phase1, generated 2026-09-14)

Source: `index.js` + `lib/*` at upstream `v0.2.3`. No code changes.
V2 ref: `https://opencode.ai/v2/docs/build/plugins/cli` (`Plugin.define({id,setup})`).

| File:Line | Category | V1 snippet | Proposed V2 `ctx.*` equivalent |
|---|---|---|---|
| `index.js:962-995` | Exported shape / entry | `const plugin = { id: PLUGIN_ID, tui: async (api, options={}) => {...} }; export default plugin` | `import {Plugin} from "@opencode/plugin/tui"; export default Plugin.define({id: "opencode-voice", setup(ctx){...; return ()=>cleanup}})` + `package.json: {"exports":{".":"./index.js","./tui":"./index.js"}}` |
| `index.js:964` | `ctx` pattern / options | `tui: async (api, options={}) => { ctx={api, options, runtime} }` | `setup(ctx){ ctx.options; ctx.client; ctx.storage; ctx.keymap; ctx.ui; ctx.data; ctx.app; ctx.location; ctx.renderer; ctx.theme }` — no custom `ctx.api` wrapper |
| `index.js:966-980` | `ctx` pattern (custom) | `ctx={api,options,runtime,disposeCommands,registerCommands(){...}}` threaded into `showSettings(ctx)`, `startVoice(ctx)`, etc. | Delete custom `ctx`; use V2 `context` directly: `ctx.storage`, `ctx.keymap.layer`, `ctx.ui.dialog/toast`, `ctx.client`; keep `VoiceRuntime` as module-local instance closed over by `setup` |
| `index.js:6-20` | `api.kv` keys | `const KV={hotkey:"voice.hotkey", recordingHotkey:"voice.recordingHotkey", ...}` | `const [settings, updateSettings] = ctx.storage.store("settings", {initial: DEFAULT_SETTINGS})` — single JSON store, no manual key map |
| `index.js:24` | `api.kv` | `kv.get(key, settings[name])` in `readSettings(ctx.api.kv)` | `const [settings] = ctx.storage.store("settings",{initial:DEFAULT_SETTINGS}); settings.model` (reactive, synced across TUI instances) |
| `index.js:38-40` | `api.kv` | `kv.set(KV[name], value)` in `writeSetting(ctx.api.kv,"model",id)` | `await updateSettings(d=>{d.model=id})` from `ctx.storage.store("settings",...)` |
| `index.js:44-49,982` | `api.kv` | `migrateSettings(api.kv)` | One-time migration inside `setup`: read legacy store, `await updateSettings()`, then drop `KV` map |
| `index.js:52-54` | `api.ui.toast` helper | `api.ui.toast({title:"Voice",message,variant})` | `ctx.ui.toast.show({title:"Voice",message,variant, duration:3000})` |
| `index.js:56-59` | `api.ui.dialog` helper | `ctx.api.ui.dialog.setSize(size); ctx.api.ui.dialog.replace(render)` in `setDialog(ctx,size,render)` | Custom JSX: `ctx.ui.dialog.set({size, centered:true}); ctx.ui.dialog.show(()=>JSX, onClose)`; simple cases use promise API below |
| `index.js:101,132,159,585,664` | `api.ui.dialog` | `ctx.api.ui.DialogAlert({title,message,onConfirm})` | `await ctx.ui.dialog.alert({title,message})` then `showSettings()`; progress renders use `ctx.ui.dialog.show()` |
| `index.js:278,456,487,526,620,688,708,747,782` | `api.ui.dialog` | `ctx.api.ui.DialogSelect({...})` | `const v = await ctx.ui.dialog.select({title,current,options:[{title,value,description,disabled,category}]})` + `switch(v)` |
| `index.js:331-342` | `api.ui.dialog` | `ctx.api.ui.DialogPrompt({...})` in `showPrompt` | `const v = await ctx.ui.dialog.prompt({title,placeholder}); if(v) updateSettings(...); else showSettings()` |
| `index.js:299,315,839` | `api.ui.dialog` | `ctx.api.ui.dialog.clear()` | `ctx.ui.dialog.clear()` (unchanged name, now on `ctx.ui.dialog`) |
| `index.js:974-978` | `api.keymap` | `api.keymap.registerLayer({priority:100, commands:buildCommands(ctx), bindings:buildBindings(settings)})` + manual `disposeCommands()` | `ctx.keymap.layer(()=>({mode:"global", priority:100, commands:[...], bindings:["voice.record","voice.submit"]}))`; reactive, no manual dispose |
| `index.js:888-900` | `api.keymap` bindings | `{key:settings.recordingHotkey, event:"press", cmd:"voice.record"}` | Per-command `bind`: `{id:"voice.record", title:"Voice: record", group:"Voice", bind:settings.recordingHotkey, palette:true, slash:{name:"voice"}, run:...}` |
| `index.js:902-960` | Commands shape | `{name:"voice.record", title, desc, category:"Voice", slashName:"voice", run:()=>toggleVoice(ctx)}` (x6) | `{id:"voice.record", title:"Voice: record", group:"Voice", bind?, palette:true, slash:{name:"voice"}, enabled:()=>true, run:async()=>...}` |
| `index.js:800-801` | `api.client` | `await ctx.api.client.tui.appendPrompt({text}); await ctx.api.client.tui.submitPrompt()` | `await ctx.client.tui.appendPrompt({text}); await ctx.client.tui.submitPrompt()` (verify `tui.*` still exposed in V2, else session/prompt equivalent) |
| `index.js:984-987` | `api.lifecycle` | `api.lifecycle.onDispose(()=>{dispose(); runtime.cancel()})` | `return ()=>{ stopLayer?.(); runtime.cancel() }` from `setup()` |
| `index.js:989-991` | Lifecycle timing | `setTimeout(()=>{if(shouldShowStartupModelPicker(ctx)) showModelPicker(ctx,true)},250)` | Same logic at top of `setup()`; no `setTimeout` hack |
| `index.js:324-328` | `ctx.options` passthrough | `isModelDownloaded(model, ctx.options, settings)` | `ctx.options` unchanged in V2 `setup(ctx)`; keep passing to `lib/*` |
| `lib/models.js, download.js, engine.js, engines.js, wav.js, handy-model-catalog.js` | Pure libs (keep) | `MODELS, DEFAULT_SETTINGS, downloadModel, VoiceRuntime, installEngine, repairWav, HANDY_MODELS` | No V2 change; import directly in `./tui` setup |

Free-model note: inventory via `groq/llama-3.1-8b-instant` class explore subagent.
