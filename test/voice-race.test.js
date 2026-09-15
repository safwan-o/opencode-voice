import assert from "node:assert/strict";
import test from "node:test";
import { normalizeSettings } from "../src/settings.ts";
import { createVoiceController } from "../src/voice.ts";

const readyStub = {
  isModelDownloaded: () => true,
  ensureDownloaded: async () => true,
  ensureEngineReady: async () => true,
  ensureRecorderReady: async () => true,
};

function deferred() {
  let resolve;
  const promise = new Promise((r) => (resolve = r));
  return { promise, resolve };
}

// Runtime where stop() is slow (SIGINT + waitForExit in production).
function slowStopRuntime() {
  const gate = deferred();
  const rt = {
    recording: false,
    transcribing: false,
    pendingSubmit: false,
    starts: 0,
    stops: 0,
    transcribes: 0,
    async start() {
      this.starts++;
      this.recording = true;
    },
    async stop() {
      this.stops++;
      await gate.promise;
      this.recording = false;
      return "/tmp/a.wav";
    },
    async transcribe() {
      this.transcribes++;
      this.transcribing = true;
      return "text";
    },
    cancel() {},
    isRecording() {
      return this.recording;
    },
    isTranscribing() {
      return this.transcribing;
    },
    releaseStop: gate.resolve,
  };
  return rt;
}

function harness(runtime, extra = {}) {
  const delivered = [];
  const toasts = [];
  const c = createVoiceController({
    runtime,
    options: {},
    getSettings: () => normalizeSettings({}),
    toast: (m, v = "info") => toasts.push([m, v]),
    deliver: async (text, submit) => delivered.push([text, submit]),
    onSetupError: () => {},
    ready: readyStub,
    ...extra,
  });
  return { c, delivered, toasts };
}

test("rapid double toggle starts recording once", async () => {
  const rt = slowStopRuntime();
  const { c } = harness(rt);
  await Promise.all([c.toggle(false), c.toggle(false)]);
  assert.equal(rt.starts, 1);
});

test("concurrent finish during slow stop transcribes once", async () => {
  const rt = slowStopRuntime();
  const { c, delivered } = harness(rt);
  await c.toggle(false);
  assert.equal(rt.recording, true);
  const f = Promise.all([c.toggle(false), c.toggle(false), c.toggle(false)]);
  await Promise.resolve();
  rt.releaseStop();
  await f;
  assert.equal(rt.transcribes, 1);
  assert.equal(delivered.length, 1);
});

test("toggle in stop-to-transcribe gap does not start over", async () => {
  const rt = slowStopRuntime();
  const preTranscribe = deferred();
  const origTranscribe = rt.transcribe.bind(rt);
  rt.transcribe = async (...a) => {
    await preTranscribe.promise;
    return origTranscribe(...a);
  };
  const { c } = harness(rt);
  await c.toggle(false);
  const finishing = c.toggle(false);
  await Promise.resolve();
  rt.releaseStop();
  await Promise.resolve();
  await Promise.resolve();
  // stop() resolved (recording false) but transcribe() not yet flagged: must not restart.
  await c.toggle(false);
  preTranscribe.resolve();
  await finishing;
  assert.equal(rt.starts, 1);
});
