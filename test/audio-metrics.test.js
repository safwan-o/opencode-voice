import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { lowRatio, peak, readPcm16Mono, rms } from "./helpers-audio.js";

function sine(freq, seconds, rate = 16000, amp = 10000) {
  const n = Math.floor(seconds * rate);
  const out = new Int16Array(n);
  for (let i = 0; i < n; i++) out[i] = Math.round(amp * Math.sin((2 * Math.PI * freq * i) / rate));
  return out;
}

test("silence measures zero", () => {
  const s = new Int16Array(16000);
  assert.equal(rms(s), 0);
  assert.equal(peak(s), 0);
  assert.equal(lowRatio(s), 0);
});

test("pure 55 Hz tone reads as rumble", () => {
  const r = lowRatio(sine(55, 1));
  assert.ok(r > 0.9, `expected ~1, got ${r}`);
});

test("3 kHz tone reads as non-low", () => {
  const r = lowRatio(sine(3000, 1));
  assert.ok(r < 0.05, `expected ~0, got ${r}`);
});

test("reader walks LIST chunks", () => {
  // Minimal fmt + LIST + data file, as seen in ffmpeg-written wavs.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wav-"));
  const file = path.join(dir, "a.wav");
  try {
    const pcm = Buffer.alloc(1600);
    for (let i = 0; i < 800; i++) pcm.writeInt16LE(Math.round(5000 * Math.sin((2 * Math.PI * 440 * i) / 16000)), i * 2);
    const fmt = Buffer.alloc(24);
    fmt.write("fmt ", 0);
    fmt.writeUInt32LE(16, 4);
    fmt.writeUInt16LE(1, 8);
    fmt.writeUInt16LE(1, 10);
    fmt.writeUInt32LE(16000, 12);
    fmt.writeUInt32LE(32000, 16);
    fmt.writeUInt16LE(2, 20);
    fmt.writeUInt16LE(16, 22);
    const list = Buffer.alloc(8 + 26);
    list.write("LIST", 0);
    list.writeUInt32LE(26, 4);
    const data = Buffer.alloc(8 + pcm.length);
    data.write("data", 0);
    data.writeUInt32LE(pcm.length, 4);
    pcm.copy(data, 8);
    const body = Buffer.concat([fmt, list, data]);
    const head = Buffer.alloc(12);
    head.write("RIFF", 0);
    head.writeUInt32LE(4 + body.length, 4);
    head.write("WAVE", 8);
    fs.writeFileSync(file, Buffer.concat([head, body]));
    const { samples, sampleRate } = readPcm16Mono(file);
    assert.equal(sampleRate, 16000);
    assert.equal(samples.length, 800);
    assert.ok(rms(samples) > 1000);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
