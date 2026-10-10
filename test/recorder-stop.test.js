import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { VoiceRuntime, buildRecorders, startRecorder } from "../lib/engine.js";

const FAKE = path.resolve("test/helpers-fake-recorder.js");

function tempWav(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "voice-recorder-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return path.join(dir, "voice.wav");
}

function fakeRecorder(file, { openDelayMs = 0, mode = "record", stopInput } = {}) {
  return {
    label: `fake recorder (${mode})`,
    command: process.execPath,
    args: [FAKE, file, String(openDelayMs), mode],
    ...(stopInput ? { stopInput } : {}),
  };
}

function runtimeWith(active) {
  const rt = new VoiceRuntime({});
  rt.recording = active;
  return rt;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Control: kill()-based stop discards a recorder's buffered audio (the Windows bug).
test("signal stop leaves a buffered recorder's WAV empty", { timeout: 20000 }, async (t) => {
  const file = tempWav(t);
  const active = await startRecorder(fakeRecorder(file), file);
  await sleep(500);
  await assert.rejects(() => runtimeWith(active).stop(), /Recording is empty/);
  assert.equal(fs.statSync(file).size, 0);
});

test("stopInput stop lets the recorder finalize a non-empty WAV", { timeout: 20000 }, async (t) => {
  const file = tempWav(t);
  const active = await startRecorder(fakeRecorder(file, { stopInput: "q" }), file);
  await sleep(500);
  const result = await runtimeWith(active).stop();
  assert.equal(result, file);
  assert.equal(active.proc.exitCode, 0);
  const wav = fs.readFileSync(file);
  assert.ok(wav.length > 44, `expected audio data, got ${wav.length} bytes`);
  assert.equal(wav.toString("ascii", 0, 4), "RIFF");
});

test(
  "startRecorder waits for a device that opens after the grace period",
  { timeout: 20000 },
  async (t) => {
    const file = tempWav(t);
    const active = await startRecorder(
      fakeRecorder(file, { openDelayMs: 1500, stopInput: "q" }),
      file,
    );
    assert.ok(fs.existsSync(file));
    await sleep(300);
    assert.equal(await runtimeWith(active).stop(), file);
  },
);

test(
  "startRecorder still rejects a recorder that exits immediately",
  { timeout: 20000 },
  async (t) => {
    const file = tempWav(t);
    await assert.rejects(
      () => startRecorder(fakeRecorder(file, { mode: "fail" }), file),
      /Could not find audio only device/,
    );
  },
);

test(
  "Windows dshow recorders stop through ffmpeg's q command",
  { skip: process.platform !== "win32" },
  (t) => {
    const file = tempWav(t);
    const recorders = buildRecorders(file, {
      ffmpeg: process.execPath,
      mic: "Wireless Mic Rx",
      skipFfmpegStaticInstall: true,
    });
    const dshow = recorders.filter((recorder) => recorder.label.startsWith("ffmpeg dshow"));
    assert.ok(dshow.length > 0);
    assert.equal(dshow[0].label, "ffmpeg dshow (Wireless Mic Rx)");
    for (const recorder of dshow) assert.equal(recorder.stopInput, "q");
  },
);
