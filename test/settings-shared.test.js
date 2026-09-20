import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_MODEL_ID, getModel, MODELS } from "../lib/models.js";
import {
  mergeLegacyHotkey,
  migrateHotkeyV2,
  normalizeSettings,
  optionsOverlay,
  V2_DEFAULT_HOTKEY,
} from "../lib/settings.js";

const implemented = MODELS.find((m) => m.implemented) ?? getModel(DEFAULT_MODEL_ID);

function fakeKv(initial = {}) {
  const store = { ...initial };
  return {
    store,
    get: (key, fallback) => (key in store ? store[key] : fallback),
    set: (key, value) => {
      store[key] = value;
    },
  };
}

test("lib defaults match the unified contract", () => {
  assert.equal(V2_DEFAULT_HOTKEY, "ctrl+space");
  const s = normalizeSettings({});
  assert.equal(s.recordingHotkey, "ctrl+space");
  assert.equal(s.model, DEFAULT_MODEL_ID);
  assert.equal(s.language, "auto");
  assert.equal(s.voiceEnhance, true);
  assert.equal(s.cleanupCutoffHz, 120);
});

test("lib preserves unknown ids, resets unimplemented models", () => {
  assert.equal(normalizeSettings({ model: implemented.id }).model, implemented.id);
  // getModel() falls back to default at use sites, so unknown ids pass through.
  assert.equal(normalizeSettings({ model: "nope" }).model, "nope");
  const planned = MODELS.find((m) => !m.implemented);
  if (planned) {
    assert.equal(normalizeSettings({ model: planned.id }).model, DEFAULT_MODEL_ID);
  }
});

test("lib legacy merge prefers explicit hold key", () => {
  assert.equal(
    mergeLegacyHotkey({}, { hotkey: "alt+r", toggleHotkey: "ctrl+r" }).recordingHotkey,
    "alt+r",
  );
  assert.equal(mergeLegacyHotkey({}, { toggleHotkey: "ctrl+space" }).recordingHotkey, "ctrl+space");
  assert.equal(
    mergeLegacyHotkey({ recordingHotkey: "ctrl+r" }, { hotkey: "alt+r" }).recordingHotkey,
    "ctrl+r",
  );
  assert.equal(mergeLegacyHotkey({}, {}).recordingHotkey, "ctrl+space");
});

test("lib migration moves old default once", () => {
  assert.deepEqual(migrateHotkeyV2(normalizeSettings({ recordingHotkey: "ctrl+r" })), {
    recordingHotkey: "ctrl+space",
    hotkeyMigratedV2: true,
  });
  assert.deepEqual(migrateHotkeyV2(normalizeSettings({ recordingHotkey: "alt+r" })), {
    hotkeyMigratedV2: true,
  });
  assert.equal(
    migrateHotkeyV2(normalizeSettings({ recordingHotkey: "ctrl+r", hotkeyMigratedV2: true })),
    undefined,
  );
});

test("lib options overlay keeps known keys only", () => {
  assert.deepEqual(optionsOverlay({ model: "x", voiceEnhance: false, bogus: 1 }), {
    model: "x",
    voiceEnhance: false,
  });
  assert.deepEqual(optionsOverlay(), {});
});

test("V1 readSettings: plugin options lose to nothing but stored KV", async () => {
  const { KV, readSettings } = await import("../index.js");
  const empty = readSettings(fakeKv({}), { recordingHotkey: "alt+r", mic: "hw:0" });
  assert.equal(empty.recordingHotkey, "alt+r", "options must beat the merge default");
  assert.equal(empty.mic, "hw:0");
  const stored = readSettings(fakeKv({ [KV.recordingHotkey]: "alt+g" }), {
    recordingHotkey: "alt+r",
  });
  assert.equal(stored.recordingHotkey, "alt+g", "stored KV still beats options");
  assert.ok(KV.voiceEnhance && KV.cleanupCutoffHz && KV.hotkeyMigratedV2);
  const kv = fakeKv({ [KV.language]: "de", [KV.voiceEnhance]: false });
  const s = readSettings(kv, { language: "fr", mic: "hw:0" });
  assert.equal(s.language, "de", "stored value must win over options");
  assert.equal(s.mic, "hw:0", "options fill unset keys");
  assert.equal(s.voiceEnhance, false);
  assert.equal(s.cleanupCutoffHz, 120);
});

test("V1 readSettings: legacy hold key flows through, submitHotkey trimmed", async () => {
  const { KV, readSettings } = await import("../index.js");
  const kv = fakeKv({ [KV.hotkey]: "alt+r", [KV.submitHotkey]: "  leader r  " });
  const s = readSettings(kv);
  assert.equal(s.recordingHotkey, "alt+r");
  assert.equal(s.submitHotkey, "leader r");
});

test("V1 migrateSettings writes back once", async () => {
  const { KV, migrateSettings, readSettings } = await import("../index.js");
  const kv = fakeKv({ [KV.recordingHotkey]: "ctrl+r" });
  migrateSettings(kv);
  assert.equal(kv.store[KV.recordingHotkey], "ctrl+space");
  assert.equal(kv.store[KV.hotkeyMigratedV2], true);
  assert.equal(readSettings(kv).recordingHotkey, "ctrl+space");
  const size = Object.keys(kv.store).length;
  migrateSettings(kv);
  assert.equal(Object.keys(kv.store).length, size, "second run must be a no-op");
});
