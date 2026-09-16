// Test-only WAV metrics (not shipped). No dependencies.
import fs from "node:fs";

/** Minimal RIFF walker: returns mono Int16 samples + sample rate. */
export function readPcm16Mono(file) {
  const d = fs.readFileSync(file);
  if (d.toString("ascii", 0, 4) !== "RIFF" || d.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error(`not a WAV file: ${file}`);
  }
  let pos = 12;
  let sampleRate = 0;
  let data = null;
  while (pos + 8 <= d.length) {
    const id = d.toString("ascii", pos, pos + 4);
    const size = d.readUInt32LE(pos + 4);
    if (id === "fmt " && size >= 16) {
      sampleRate = d.readUInt32LE(pos + 12);
    }
    if (id === "data") {
      data = d.subarray(pos + 8, pos + 8 + size);
    }
    if (size > 500_000_000) break;
    pos += 8 + size + (size % 2);
  }
  if (!sampleRate || !data) throw new Error(`unreadable WAV: ${file}`);
  const count = Math.floor(data.length / 2);
  const samples = new Int16Array(count);
  for (let i = 0; i < count; i++) samples[i] = data.readInt16LE(i * 2);
  return { samples, sampleRate };
}

export function rms(samples) {
  if (!samples.length) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  return Math.sqrt(sum / samples.length);
}

export function peak(samples) {
  let p = 0;
  for (let i = 0; i < samples.length; i++) {
    const a = Math.abs(samples[i]);
    if (a > p) p = a;
  }
  return p;
}

/**
 * Fraction of energy below ~300 Hz via one-pole lowpass.
 * Same band analysis used to diagnose the real-world rumble clip.
 */
export function lowRatio(samples, sampleRate = 16000) {
  if (!samples.length) return 0;
  const rc = 1 / (2 * Math.PI * 300);
  const dt = 1 / (sampleRate || 16000);
  const a = dt / (rc + dt);
  let y = 0;
  let low = 0;
  let total = 0;
  for (let i = 0; i < samples.length; i++) {
    const x = samples[i] / 32768;
    y += a * (x - y);
    low += y * y;
    total += x * x;
  }
  if (total === 0) return 0;
  return low / total;
}
