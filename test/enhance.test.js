import assert from "node:assert/strict";
import test from "node:test";
import { buildFilterChain, ENHANCE } from "../src/enhance.ts";

test("disabled cleanup builds nothing", () => {
  assert.equal(buildFilterChain({ enabled: false, ffmpeg: true }), null);
});

test("non-ffmpeg recorder builds nothing", () => {
  assert.equal(buildFilterChain({ enabled: true, ffmpeg: false }), null);
});

test("enabled ffmpeg recorder builds the locked chain", () => {
  assert.equal(
    buildFilterChain({ enabled: true, ffmpeg: true }),
    "highpass=f=120,adeclick,dynaudnorm=f=150:g=7,alimiter=limit=0.95",
  );
});

test("constants stay in voice-safe bands", () => {
  assert.ok(ENHANCE.highpassFreq >= 80 && ENHANCE.highpassFreq <= 200, `highpass ${ENHANCE.highpassFreq}`);
  assert.ok(ENHANCE.limiter === "alimiter=limit=0.95");
});
