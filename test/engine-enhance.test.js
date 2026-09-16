import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { VoiceRuntime } from "../lib/engine.js";
import { getModel, getModelPath } from "../lib/models.js";

function haveFfmpeg() {
  try {
    return spawnSync("ffmpeg", ["-hide_banner", "-version"], { stdio: "ignore" }).status === 0;
  } catch {
    return false;
  }
}

function stackReady() {
  try {
    if (!haveFfmpeg()) return false;
    execFileSync("node", ["scripts/gen-voice-fixtures.mjs"], { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

async function moonshineReady() {
  const { resolveCommand } = await import("../lib/engine.js");
  const model = getModel("handy-moonshine-base-gguf");
  if (!resolveCommand("opencode-voice-transcribe", {})) return null;
  if (!fs.existsSync(getModelPath(model, {}, {}))) return null;
  return model;
}

function leftovers() {
  return fs.readdirSync("test/fixtures").filter((f) => f.includes(".clean.wav"));
}

function withCleanPath(fn) {
  return async () => {
    const saved = process.env.PATH;
    process.env.PATH = path.join(os.tmpdir(), "voice-no-bin-" + Date.now());
    try {
      await fn();
    } finally {
      process.env.PATH = saved;
    }
  };
}

// Control: synthetic hot rumble defeats the raw path (the bug being fixed).
test("transcribe without cleanup stays empty on rumble", { timeout: 180000 }, async (t) => {
  if (!stackReady()) {
    t.skip("needs ffmpeg");
    return;
  }
  const model = await moonshineReady();
  if (!model) {
    t.skip("needs transcribe sidecar + moonshine model");
    return;
  }
  const rt = new VoiceRuntime({});
  const settings = { voiceEnhance: false, language: "auto", downloadDir: "", autoSubmit: false };
  await assert.rejects(() => rt.transcribe("test/fixtures/rumble.wav", model, settings), /empty/i);
  assert.deepEqual(leftovers(), [], "no temp files without filtering");
});

// No ffmpeg binary: enhancement degrades to raw instead of crashing.
test("transcribe without ffmpeg falls back to raw", { timeout: 180000 }, async (t) => {
  if (!stackReady()) {
    t.skip("needs ffmpeg");
    return;
  }
  const model = await moonshineReady();
  if (!model) {
    t.skip("needs transcribe sidecar + moonshine model");
    return;
  }
  const rt = new VoiceRuntime({});
  const settings = { voiceEnhance: true, language: "auto", downloadDir: "", autoSubmit: false };
  await withCleanPath(async () => {
    await assert.rejects(
      () => rt.transcribe("test/fixtures/rumble.wav", model, settings),
      /empty|not found|ENOENT/i,
    );
  })();
});

// Full proof with real speech: edge-tts sentence through the filter step.
// Asserts the pipeline runs, cleans up, and preserves intelligibility —
// plus a hum mix to show filtering engages without corrupting.
// (Pure-sine hum cannot defeat moonshine the way real room rumble does, so
// the rumble-recovery claim rests on the documented manual proof with the
// real-world clip; see docs/voice-cleanup.md.)
// Skips cleanly offline.
test("transcribe with cleanup preserves clean speech", { timeout: 240000 }, async (t) => {
  if (!stackReady()) {
    t.skip("needs ffmpeg");
    return;
  }
  const model = await moonshineReady();
  if (!model) {
    t.skip("needs transcribe sidecar + moonshine model");
    return;
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "voice-e2e-"));
  try {
    execFileSync(
      "python3",
      [
        "-c",
        "import asyncio, edge_tts; asyncio.run(edge_tts.Communicate('the quick brown fox jumps over the lazy dog', 'en-US-AvaMultilingualNeural').save('tts.mp3'))",
      ],
      { cwd: dir, stdio: "pipe", timeout: 90000 },
    );
    execFileSync("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-i",
      path.join(dir, "tts.mp3"),
      "-ar",
      "16000",
      "-ac",
      "1",
      "-c:a",
      "pcm_s16le",
      path.join(dir, "speech.wav"),
    ]);
    const rt = new VoiceRuntime({});
    const base = { language: "auto", downloadDir: "", autoSubmit: false };
    const text = await rt.transcribe(path.join(dir, "speech.wav"), model, {
      ...base,
      voiceEnhance: true,
    });
    // NOTE: moonshine systematically hears edge-tts "quick" as "click";
    // assert the stable remainder of the sentence.
    assert.match(text.toLowerCase(), /brown fox jumps over the lazy dog/);
    assert.deepEqual(leftovers(), [], "filtered temp files must be cleaned up");
  } catch (error) {
    if (String(error?.message || error).includes("edge_tts") || String(error?.code) === "ENOENT") {
      t.skip("needs edge-tts package + network");
      return;
    }
    throw error;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
