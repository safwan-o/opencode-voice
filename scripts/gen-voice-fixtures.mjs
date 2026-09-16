// Dev-only fixture generator for voice-cleanup work (Phase 0).
// Procedurally synthesizes rumble/clean/silence WAVs with system ffmpeg.
// No blobs, no user audio, no network. Skips cleanly without ffmpeg.
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "test", "fixtures");

function haveFfmpeg() {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-version"], { stdio: "ignore" });
  return r.status === 0;
}

function run(args, dest) {
  // Write to a temp name + atomic rename: test files run in parallel and
  // readers must never observe a half-written fixture. The temp keeps a
  // .wav suffix so ffmpeg still infers the muxer.
  const tmp = `${dest}.${process.pid}.tmp.wav`;
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args, tmp], { stdio: "inherit" });
  fs.renameSync(tmp, dest);
}

function main() {
  if (!haveFfmpeg()) {
    console.log("gen-voice-fixtures: ffmpeg not found, skipping fixture generation");
    return;
  }
  fs.mkdirSync(dir, { recursive: true });
  const out = (name) => path.join(dir, name);
  const pcm = ["-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le"];

  // Speech-like voice: harmonic complex (110 Hz + harmonics) with 4 Hz
  // syllabic amplitude modulation + fades (no clicks).
  const voice =
    "[0:a][1:a][2:a][3:a][4:a][5:a]amix=inputs=6:normalize=0,volume=0.15,tremolo=f=4:d=0.8,afade=t=in:st=0:d=0.2,afade=t=out:st=3.6:d=0.4[v]";
  run(["-f", "lavfi", "-i", "sine=frequency=110:duration=4", "-f", "lavfi", "-i", "sine=frequency=220:duration=4", "-f", "lavfi", "-i", "sine=frequency=330:duration=4", "-f", "lavfi", "-i", "sine=frequency=440:duration=4", "-f", "lavfi", "-i", "sine=frequency=550:duration=4", "-f", "lavfi", "-i", "sine=frequency=660:duration=4", "-filter_complex", voice, "-map", "[v]", ...pcm], out("clean.wav"));

  // Rumble fixture: same voice + mains-style hum (50 Hz + decaying 100/150 Hz
  // harmonics) mixed hot (mirrors the diagnosed real-world clip: ~70% of
  // energy below 300 Hz).
  const rumble =
    "[0:a][1:a][2:a][3:a][4:a][5:a]amix=inputs=6:normalize=0,volume=0.15,tremolo=f=4:d=0.8[vx];" +
    "[6:a]volume=0.5[h0];[7:a]volume=0.25[h1];[8:a]volume=0.12[h2];[h0][h1][h2]amix=inputs=3:normalize=0[hum];" +
    "[vx][hum]amix=inputs=2:normalize=0,afade=t=in:st=0:d=0.2,afade=t=out:st=3.6:d=0.4[out]";
  run([
    "-f", "lavfi", "-i", "sine=frequency=110:duration=4",
    "-f", "lavfi", "-i", "sine=frequency=220:duration=4",
    "-f", "lavfi", "-i", "sine=frequency=330:duration=4",
    "-f", "lavfi", "-i", "sine=frequency=440:duration=4",
    "-f", "lavfi", "-i", "sine=frequency=550:duration=4",
    "-f", "lavfi", "-i", "sine=frequency=660:duration=4",
    "-f", "lavfi", "-i", "sine=frequency=50:duration=4",
    "-f", "lavfi", "-i", "sine=frequency=100:duration=4",
    "-f", "lavfi", "-i", "sine=frequency=150:duration=4",
    "-filter_complex", rumble, "-map", "[out]", ...pcm], out("rumble.wav"));

  // Digital silence.
  run(["-f", "lavfi", "-i", "anullsrc=r=16000:cl=mono:d=2", ...pcm], out("silence.wav"));
  console.log(`gen-voice-fixtures: wrote ${out("clean.wav")}, ${out("rumble.wav")}, ${out("silence.wav")}`);
}

main();
