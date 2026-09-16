import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { lowRatio, readPcm16Mono, rms } from "./helpers-audio.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function haveFfmpeg() {
  try {
    return spawnSync("ffmpeg", ["-hide_banner", "-version"], { stdio: "ignore" }).status === 0;
  } catch {
    return false;
  }
}

// Guards fixture calibration: rumble must look rumbly, clean must not,
// silence must be silent. Regenerates via the checked-in script first.
test("voice fixtures are calibrated", { skip: !haveFfmpeg() && "ffmpeg not available" }, () => {
  execFileSync("node", [path.join(root, "scripts", "gen-voice-fixtures.mjs")], {
    stdio: "pipe",
    cwd: root,
  });
  const clean = readPcm16Mono(path.join(root, "test", "fixtures", "clean.wav"));
  const rumble = readPcm16Mono(path.join(root, "test", "fixtures", "rumble.wav"));
  const silence = readPcm16Mono(path.join(root, "test", "fixtures", "silence.wav"));
  const cleanRatio = lowRatio(clean.samples, clean.sampleRate);
  const rumbleRatio = lowRatio(rumble.samples, rumble.sampleRate);
  assert.ok(cleanRatio < 0.55, `clean lowRatio ${cleanRatio}`);
  assert.ok(rumbleRatio > 0.7, `rumble lowRatio ${rumbleRatio}`);
  assert.ok(rumbleRatio - cleanRatio > 0.25, "rumble/clean separation");
  assert.equal(rms(silence.samples), 0);
});
