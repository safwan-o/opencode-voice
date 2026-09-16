import assert from "node:assert/strict";
import test from "node:test";
import { buildFilterChain, ENHANCE } from "../src/enhance.ts";

test("disabled cleanup builds nothing", () => {
  assert.equal(buildFilterChain({ enabled: false }), null);
  assert.equal(buildFilterChain({ enabled: false, cutoffHz: 200 }), null);
});

test("enabled cleanup builds the locked chain", () => {
  assert.equal(
    buildFilterChain({ enabled: true }),
    "highpass=f=120,adeclick,dynaudnorm=f=150:g=7,alimiter=limit=0.95",
  );
});

test("custom cutoff is reflected", () => {
  const chain = buildFilterChain({ enabled: true, cutoffHz: 180 });
  assert.ok(chain?.startsWith("highpass=f=180,"), chain ?? "null");
});

test("bad cutoff falls back to default", () => {
  for (const cutoffHz of [undefined, null, "", "abc", Number.NaN, 0, -5, 9999]) {
    const chain = buildFilterChain({ enabled: true, cutoffHz });
    assert.ok(chain?.startsWith("highpass=f=120,"), `${String(cutoffHz)} -> ${chain}`);
  }
});

test("cutoff clamps to the voice-safe band", () => {
  assert.ok(buildFilterChain({ enabled: true, cutoffHz: 20 })?.startsWith("highpass=f=40,"));
  assert.ok(buildFilterChain({ enabled: true, cutoffHz: 900 })?.startsWith("highpass=f=500,"));
});

test("constants stay in voice-safe bands", () => {
  assert.ok(
    ENHANCE.highpassFreq >= 80 && ENHANCE.highpassFreq <= 200,
    `highpass ${ENHANCE.highpassFreq}`,
  );
  assert.ok(ENHANCE.limiter === "alimiter=limit=0.95");
});
