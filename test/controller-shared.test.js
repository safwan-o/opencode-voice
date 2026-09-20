import assert from "node:assert/strict";
import test from "node:test";
import { createVoiceController } from "../lib/voice-controller.js";
import { createVoiceController as createV2Controller } from "../src/voice.ts";

function stubRuntime() {
  return {
    recording: false,
    transcribing: false,
    pendingSubmit: false,
    starts: 0,
    async start() {
      this.recording = true;
      this.starts += 1;
    },
    async stop() {
      this.recording = false;
      return "/tmp/voice-test.wav";
    },
    async transcribe() {
      return "hello world";
    },
    cancel() {
      this.recording = false;
    },
    isRecording() {
      return this.recording;
    },
    isTranscribing() {
      return this.transcribing;
    },
  };
}

function stubReady(overrides = {}) {
  return {
    isModelDownloaded: () => true,
    ensureDownloaded: async () => true,
    ensureEngineReady: async () => true,
    ensureRecorderReady: async () => true,
    ...overrides,
  };
}

function deps(overrides = {}) {
  const toasts = [];
  const delivered = [];
  const setupErrors = [];
  return {
    log: { toasts, delivered, setupErrors },
    deps: {
      runtime: stubRuntime(),
      options: {},
      getSettings: () => ({}),
      toast: (message, variant = "info") => {
        toasts.push([message, variant]);
      },
      deliver: async (text, submit) => {
        delivered.push([text, submit]);
      },
      onSetupError: (title, error) => {
        setupErrors.push([title, error]);
      },
      ready: stubReady(),
      ...overrides,
    },
  };
}

test("toggle start-finish delivers the transcript", async () => {
  // Note: the trailing space is adapter-owned (V1 appendTranscription,
  // V2 tui.ts deliver); the controller passes the raw transcript through.
  const { deps: d, log } = deps();
  const c = createVoiceController(d);
  await c.toggle(false);
  await c.toggle(false);
  assert.deepEqual(log.delivered, [["hello world", false]]);
  assert.ok(log.toasts.some(([m, v]) => m === "Transcribed" && v === "success"));
});

test("concurrent toggles single-flight to one start", async () => {
  const { deps: d } = deps();
  const c = createVoiceController(d);
  await Promise.all([c.toggle(false), c.toggle(false), c.toggle(false)]);
  assert.equal(d.runtime.starts, 1);
});

test("busy runtime warns instead of starting", async () => {
  const { deps: d, log } = deps();
  d.runtime.transcribing = true;
  const c = createVoiceController(d);
  await c.toggle(false);
  assert.deepEqual(log.toasts, [["Transcription is already running", "warning"]]);
  assert.deepEqual(log.delivered, []);
});

test("submit flag routes through deliver", async () => {
  const { deps: d, log } = deps();
  const c = createVoiceController(d);
  await c.toggle(true);
  await c.toggle(true);
  assert.deepEqual(log.delivered, [["hello world", true]]);
});

test("hold toast uses hints when provided", async () => {
  const { deps: d, log } = deps({
    hints: { holdStart: (key) => `Hold ${key}!` },
    getSettings: () => ({ recordingHotkey: "alt+r" }),
  });
  const c = createVoiceController(d);
  await c.start(false, true);
  assert.ok(
    log.toasts.some(([m]) => m === "Hold alt+r!"),
    JSON.stringify(log.toasts),
  );
});

test("setup failure surfaces via onSetupError without starting", async () => {
  const { deps: d, log } = deps({
    ready: stubReady({
      isModelDownloaded: () => false,
      ensureDownloaded: async () => {
        throw new Error("no network");
      },
    }),
  });
  const c = createVoiceController(d);
  await c.toggle(false);
  assert.equal(log.setupErrors.length, 1);
  assert.equal(log.setupErrors[0][0], "Voice setup failed");
  assert.equal(d.runtime.starts, 0);
});

test("cancel resets phase and toasts", async () => {
  const { deps: d, log } = deps();
  const c = createVoiceController(d);
  await c.toggle(false);
  c.cancel();
  assert.deepEqual(log.toasts.at(-1), ["Voice recording cancelled", "info"]);
  await c.toggle(false);
  await c.toggle(false);
  assert.equal(log.delivered.length, 1);
});

test("missing ready.ensure* fails fast at creation", () => {
  const { deps: d } = deps({ ready: {} });
  assert.throws(() => createVoiceController(d), /ready\.ensureDownloaded is required/);
});

test("src/voice.ts delegates with the same behavior", async () => {
  for (const make of [createVoiceController, createV2Controller]) {
    const fns = make(deps().deps);
    for (const name of ["start", "finish", "toggle", "cancel", "stopAndTranscribe"]) {
      assert.equal(typeof fns[name], "function", name);
    }
  }
  const runs = [];
  for (const make of [createVoiceController, createV2Controller]) {
    const built = deps();
    const c = make(built.deps);
    await c.toggle(false);
    await c.toggle(false);
    runs.push(built.log);
  }
  assert.deepEqual(runs[0].delivered, runs[1].delivered);
  assert.deepEqual(
    runs[0].toasts.map(([m, v]) => [m, v]),
    runs[1].toasts.map(([m, v]) => [m, v]),
  );
});
