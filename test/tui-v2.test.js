import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_SETTINGS } from "../lib/models.js";
import { showLanguagePicker, showModelPicker, showRecordingSettings, showTranscriptionSettings } from "../src/dialogs.ts";
import { formatBytes, progressBar } from "../src/formatters.ts";
import { mergeLegacyHotkey, normalizeSettings } from "../src/settings.ts";
import tui from "../src/tui.ts";
import { createVoiceController } from "../src/voice.ts";
import { copyText } from "../src/clipboard.ts";

function mockStore(initial = {}) {
  const draft = { ...DEFAULT_SETTINGS, ...initial };
  return {
    state: draft,
    update: async (fn) => {
      fn(draft);
    },
  };
}

function mockDialog(answers = {}) {
  const log = { alerts: [], prompts: [], selects: [], selectArgs: [] };
  const selectQueue = [...(answers.select ?? [])];
  const promptQueue = [...(answers.prompt ?? [])];
  return {
    log,
    api: {
      alert: async (o) => {
        log.alerts.push(o);
      },
      confirm: async (o) => {
        log.alerts.push(o);
        return answers.confirm ?? false;
      },
      prompt: async (o) => {
        log.prompts.push(o);
        return promptQueue.shift();
      },
      select: async (o) => {
        log.selects.push(o.title);
        log.selectArgs.push(o);
        return selectQueue.shift();
      },
    },
  };
}

function stubRuntime() {
  return {
    recording: false,
    transcribing: false,
    pendingSubmit: false,
    startedWith: null,
    cancelled: false,
    async start(s) {
      this.recording = true;
      this.startedWith = s;
    },
    async stop() {
      this.recording = false;
      return "/tmp/voice-test.wav";
    },
    async transcribe() {
      return "hello world";
    },
    cancel() {
      this.cancelled = true;
    },
    isRecording() {
      return this.recording;
    },
    isTranscribing() {
      return this.transcribing;
    },
  };
}

const readyStub = {
  isModelDownloaded: () => true,
  ensureDownloaded: async () => true,
  ensureEngineReady: async () => true,
  ensureRecorderReady: async () => true,
};

test("normalizeSettings applies V1 rules", () => {
  const s = normalizeSettings({ recordingHotkey: " ", language: "", autoSubmit: 1 });
  assert.equal(s.recordingHotkey, "ctrl+space");
  assert.equal(s.language, "auto");
  assert.equal(s.autoSubmit, true);
  // V1 parity: getModel() falls back to default at use sites, so unknown ids
  // are preserved in settings (index.js:26 only resets if fallback is unimplemented).
  assert.equal(normalizeSettings({ model: "nope" }).model, "nope");
});

test("cleanup settings default on and normalize cutoff", () => {
  const d = normalizeSettings({});
  assert.equal(d.voiceEnhance, true);
  assert.equal(d.cleanupCutoffHz, 120);
  assert.equal(normalizeSettings({ voiceEnhance: false }).voiceEnhance, false);
  assert.equal(normalizeSettings({ cleanupCutoffHz: 180 }).cleanupCutoffHz, 180);
  assert.equal(normalizeSettings({ cleanupCutoffHz: "90" }).cleanupCutoffHz, 90);
  for (const bad of [0, -3, 9999, "abc", Number.NaN]) {
    assert.equal(normalizeSettings({ cleanupCutoffHz: bad }).cleanupCutoffHz, 120, String(bad));
  }
  assert.equal(normalizeSettings({ cleanupCutoffHz: 20 }).cleanupCutoffHz, 40);
});

test("recording cleanup toggle flips and persists", async () => {
  const store = mockStore({});
  const dialog = mockDialog({ select: ["cleanup", undefined, undefined] });
  const d = { dialog: dialog.api, toast: () => {}, options: {}, getSettings: () => store.state, update: store.update };
  await showRecordingSettings(d);
  assert.equal(store.state.voiceEnhance, false);
});

test("cutoff presets and custom validation", async () => {
  const store = mockStore({});
  let dialog = mockDialog({ select: ["cutoff", "180", undefined, undefined] });
  let d = { dialog: dialog.api, toast: () => {}, options: {}, getSettings: () => store.state, update: store.update };
  await showRecordingSettings(d);
  assert.equal(store.state.cleanupCutoffHz, 180);
  const toasts = [];
  dialog = mockDialog({ select: ["cutoff", "__custom", undefined, undefined], prompt: ["9"] });
  d = { dialog: dialog.api, toast: (m) => toasts.push(m), options: {}, getSettings: () => store.state, update: store.update };
  await showRecordingSettings(d);
  assert.equal(store.state.cleanupCutoffHz, 180);
  assert.ok(toasts.length > 0);
});

test("mergeLegacyHotkey prefers explicit hold key", () => {
  assert.equal(mergeLegacyHotkey({}, { hotkey: "alt+r", toggleHotkey: "ctrl+r" }).recordingHotkey, "alt+r");
  assert.equal(mergeLegacyHotkey({}, { toggleHotkey: "ctrl+space" }).recordingHotkey, "ctrl+space");
  assert.equal(mergeLegacyHotkey({ recordingHotkey: "ctrl+r" }, { hotkey: "alt+r" }).recordingHotkey, "ctrl+r");
  assert.equal(mergeLegacyHotkey({}, {}).recordingHotkey, "ctrl+space");
});

test("migrateHotkeyV2 moves old default once", async () => {
  const { migrateHotkeyV2 } = await import("../src/settings.ts");
  assert.deepEqual(migrateHotkeyV2(normalizeSettings({ recordingHotkey: "ctrl+r" })), {
    recordingHotkey: "ctrl+space",
    hotkeyMigratedV2: true,
  });
  assert.deepEqual(migrateHotkeyV2(normalizeSettings({ recordingHotkey: "alt+r" })), { hotkeyMigratedV2: true });
  assert.equal(migrateHotkeyV2(normalizeSettings({ recordingHotkey: "ctrl+r", hotkeyMigratedV2: true })), undefined);
});

test("formatters stay stable", () => {
  assert.equal(formatBytes(0), "0 MB");
  assert.equal(formatBytes(57 * 1024 * 1024), "57 MB");
  assert.ok(progressBar(50).includes("█") && progressBar(50).includes("░"));
});

test("controller toggle records, transcribes and delivers", async () => {
  const runtime = stubRuntime();
  const delivered = [];
  const toasts = [];
  const c = createVoiceController({
    runtime,
    options: {},
    getSettings: () => normalizeSettings({}),
    toast: (m, v = "info") => toasts.push([m, v]),
    deliver: async (text, submit) => delivered.push([text, submit]),
    onSetupError: () => assert.fail("no setup error expected"),
    ready: readyStub,
  });
  await c.toggle(false);
  assert.equal(runtime.recording, true);
  await c.toggle(false);
  assert.deepEqual(delivered, [["hello world", false]]);
  assert.ok(toasts.some(([m, v]) => v === "success"));
});

test("controller guards concurrent transcription", async () => {
  const runtime = stubRuntime();
  runtime.transcribing = true;
  const toasts = [];
  const c = createVoiceController({
    runtime,
    options: {},
    getSettings: () => normalizeSettings({}),
    toast: (m, v = "info") => toasts.push([m, v]),
    deliver: async () => assert.fail("must not deliver"),
    onSetupError: () => {},
    ready: readyStub,
  });
  await c.toggle(false);
  assert.ok(toasts.some(([m, v]) => v === "warning"));
});

test("controller cancel stops runtime", () => {
  const runtime = stubRuntime();
  const toasts = [];
  const c = createVoiceController({
    runtime,
    options: {},
    getSettings: () => normalizeSettings({}),
    toast: (m) => toasts.push(m),
    deliver: async () => {},
    onSetupError: () => {},
    ready: readyStub,
  });
  c.cancel();
  assert.equal(runtime.cancelled, true);
});

test("setup registers V2 keymap commands and runs record", async () => {
  const store = mockStore({ onboardingDone: true, setupSkipped: true });
  const dialog = mockDialog();
  const copied = [];
  const prompted = [];
  const runtime = stubRuntime();
  let layerFn;
  let slotClaim;
  const toasts = [];
  const ctx = {
    options: {
      createRuntime: () => runtime,
      ready: readyStub,
      clipboard: { copyText: async (t) => void copied.push(t) },
    },
    storage: { store: () => [store.state, store.update] },
    ui: {
      toast: { show: (t) => toasts.push(t) },
      dialog: dialog.api,
      router: { current: () => ({ type: "session", sessionID: "s1" }) },
      slot: (claim) => {
        slotClaim = claim;
        return () => {};
      },
    },
    keymap: { layer: (fn) => (layerFn = fn) },
    client: { session: { prompt: async (i) => prompted.push(i) } },
  };
  const cleanup = await tui.setup(ctx);
  assert.equal(typeof cleanup, "function");
  assert.equal(store.state.recordingHotkey, "ctrl+space");
  assert.equal(store.state.hotkeyMigratedV2, true);
  assert.equal(slotClaim.append, "app");
  slotClaim.render();
  const layer = layerFn();
  assert.equal(layer.mode, "global");
  const ids = layer.commands.map((c) => c.id);
  assert.deepEqual(ids, ["voice.record", "voice.submit", "voice.stop", "voice.settings"]);
  const record = layer.commands[0];
  assert.equal(record.bind, "ctrl+space");
  assert.deepEqual(record.slash, { name: "voice", aliases: ["voice-record"] });
  await record.run();
  assert.equal(runtime.recording, true);
  await record.run();
  assert.deepEqual(copied, ["hello world "]);
  assert.equal(prompted.length, 0);
  assert.ok(toasts.some((t) => t.message === "Transcription is in clipboard."));
  await cleanup();
  assert.equal(runtime.cancelled, true);
});

test("deliver copies to clipboard outside a session too", async () => {
  const store = mockStore({ onboardingDone: true, setupSkipped: true });
  const dialog = mockDialog();
  const copied = [];
  const prompted = [];
  const runtime = stubRuntime();
  let layerFn;
  let slotClaim;
  const ctx = {
    options: {
      createRuntime: () => runtime,
      ready: readyStub,
      clipboard: { copyText: async (t) => void copied.push(t) },
    },
    storage: { store: () => [store.state, store.update] },
    ui: {
      toast: { show: () => {} },
      dialog: dialog.api,
      router: { current: () => ({ type: "home" }) },
      slot: (claim) => {
        slotClaim = claim;
        return () => {};
      },
    },
    keymap: { layer: (fn) => (layerFn = fn) },
    client: { session: { prompt: async (i) => prompted.push(i) } },
  };
  const stop = await tui.setup(ctx);
  assert.equal(typeof stop, "function");
  slotClaim.render();
  const record = layerFn().commands[0];
  await record.run();
  await record.run();
  assert.deepEqual(copied, ["hello world "]);
  assert.equal(prompted.length, 0);
  assert.equal(dialog.log.alerts.length, 0);
});

test("clipboard failure shows error and falls back to dialog", async () => {
  const store = mockStore({ onboardingDone: true, setupSkipped: true });
  const dialog = mockDialog();
  const prompted = [];
  const runtime = stubRuntime();
  const toasts = [];
  let layerFn;
  let slotClaim;
  const ctx = {
    options: {
      createRuntime: () => runtime,
      ready: readyStub,
      clipboard: {
        copyText: async () => {
          throw new Error("No clipboard tool worked (tried wl-copy). Install wl-clipboard package.");
        },
      },
    },
    storage: { store: () => [store.state, store.update] },
    ui: {
      toast: { show: (t) => toasts.push(t) },
      dialog: dialog.api,
      router: { current: () => ({ type: "session", sessionID: "s1" }) },
      slot: (claim) => {
        slotClaim = claim;
        return () => {};
      },
    },
    keymap: { layer: (fn) => (layerFn = fn) },
    client: { session: { prompt: async (i) => prompted.push(i) } },
  };
  await tui.setup(ctx);
  slotClaim.render();
  const record = layerFn().commands[0];
  await record.run();
  await record.run();
  assert.equal(prompted.length, 0);
  assert.ok(toasts.some((t) => t.variant === "error"));
  assert.equal(dialog.log.alerts.length, 0);
});

test("clipboard picks platform tools with fallback", async () => {
  const calls = [];
  const ok = async (command, args, input) => void calls.push([command, input]);
  const fail = async () => {
    throw new Error("nope");
  };
  let r = await copyText("hi", { platform: "darwin", run: ok });
  assert.equal(r.method, "pbcopy");
  r = await copyText("hi", { platform: "win32", run: ok });
  assert.equal(r.method, "clip");
  r = await copyText("hi", { platform: "linux", wayland: true, run: ok });
  assert.equal(r.method, "wl-copy");
  assert.deepEqual(calls[2], ["wl-copy", "hi"]);
  calls.length = 0;
  let n = 0;
  r = await copyText("hi", {
    platform: "linux",
    wayland: false,
    run: async (c, a, i) => {
      n++;
      if (n === 1) return fail();
      return ok(c, a, i);
    },
  });
  assert.equal(r.method, "xsel");
  await assert.rejects(() => copyText("hi", { platform: "linux", wayland: false, run: fail }), /No clipboard tool worked/);
});

test("transcription settings toggle autoSubmit", async () => {
  const store = mockStore({});
  const dialog = mockDialog({ select: ["autoSubmit", undefined, undefined] });
  const d = { dialog: dialog.api, toast: () => {}, options: {}, getSettings: () => store.state, update: store.update };
  await showTranscriptionSettings(d);
  assert.equal(store.state.autoSubmit, true);
});

test("language picker custom code path", async () => {
  const store = mockStore({});
  const dialog = mockDialog({ select: ["__custom", undefined], prompt: ["de"] });
  const d = { dialog: dialog.api, toast: () => {}, options: {}, getSettings: () => store.state, update: store.update };
  await showLanguagePicker(d);
  assert.equal(store.state.language, "de");
});

test("recording hotkey preset updates store", async () => {
  const store = mockStore({});
  const dialog = mockDialog({ select: ["key", "alt+r", undefined, undefined] });
  const d = { dialog: dialog.api, toast: () => {}, options: {}, getSettings: () => store.state, update: store.update };
  await showRecordingSettings(d);
  assert.equal(store.state.recordingHotkey, "alt+r");
});

test("model picker options fit narrow dialog", async () => {
  const store = mockStore({});
  const toasts = [];
  const dialog = mockDialog({ select: ["__skip"] });
  const d = { dialog: dialog.api, toast: (m) => toasts.push(m), options: {}, getSettings: () => store.state, update: store.update };
  await showModelPicker(d, true);
  const picker = dialog.log.selectArgs[0];
  assert.ok(picker.options.length > 10);
  for (const opt of picker.options) {
    if (opt.value === "__skip") continue;
    assert.ok(opt.title.length <= 40, `title too long: ${opt.title}`);
    assert.ok(!opt.title.includes("["), `no status tags in title: ${opt.title}`);
    assert.match(opt.description, /^(downloaded|download|planned|needs verification)$/);
    assert.ok(opt.footer.length <= 45, `footer too long: ${opt.footer}`);
  }
  assert.equal(store.state.setupSkipped, true);
});

test("submit outside a session degrades to clipboard", async () => {
  const store = mockStore({ onboardingDone: true, setupSkipped: true });
  const dialog = mockDialog();
  const copied = [];
  const prompted = [];
  const runtime = stubRuntime();
  let layerFn;
  let slotClaim;
  const ctx = {
    options: {
      createRuntime: () => runtime,
      ready: readyStub,
      clipboard: { copyText: async (t) => void copied.push(t) },
    },
    storage: { store: () => [store.state, store.update] },
    ui: {
      toast: { show: () => {} },
      dialog: dialog.api,
      router: { current: () => ({ type: "home" }) },
      slot: (claim) => {
        slotClaim = claim;
        return () => {};
      },
    },
    keymap: { layer: (fn) => (layerFn = fn) },
    client: { session: { prompt: async (i) => prompted.push(i) } },
  };
  await tui.setup(ctx);
  slotClaim.render();
  const submit = layerFn().commands[1];
  assert.equal(submit.id, "voice.submit");
  await submit.run();
  await submit.run();
  assert.equal(prompted.length, 0);
  assert.deepEqual(copied, ["hello world "]);
  assert.equal(dialog.log.alerts.length, 0);
});

test("autoSubmit sends immediately without review", async () => {
  const store = mockStore({ onboardingDone: true, setupSkipped: true, autoSubmit: true });
  const dialog = mockDialog();
  const prompted = [];
  const runtime = stubRuntime();
  let layerFn;
  let slotClaim;
  const ctx = {
    options: { createRuntime: () => runtime, ready: readyStub },
    storage: { store: () => [store.state, store.update] },
    ui: {
      toast: { show: () => {} },
      dialog: dialog.api,
      router: { current: () => ({ type: "session", sessionID: "s1" }) },
      slot: (claim) => {
        slotClaim = claim;
        return () => {};
      },
    },
    keymap: { layer: (fn) => (layerFn = fn) },
    client: { session: { prompt: async (i) => prompted.push(i) } },
  };
  await tui.setup(ctx);
  slotClaim.render();
  const record = layerFn().commands[0];
  await record.run();
  await record.run();
  assert.equal(prompted.length, 1);
  assert.equal(dialog.log.prompts.length, 0);
});
