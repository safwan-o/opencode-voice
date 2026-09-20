// Shared settings normalization (canonical home; plain JS so lib/ stays .ts-free).
// Consumed by the V1 adapter (index.js) directly and re-exported by src/settings.ts
// for V2, so both OpenCode versions normalize identically.
import { normalizeCutoffHz } from "./enhance.js";
import { DEFAULT_SETTINGS, getModel } from "./models.js";

/** Default record key: ctrl+r is factory-bound to session rename, so we no longer claim it. */
export const V2_DEFAULT_HOTKEY = "ctrl+space";
const LEGACY_DEFAULT_HOTKEY = "ctrl+r";

/** Same normalization rules as V1 `readSettings` (index.js). Extra keys pass through untouched. */
export function normalizeSettings(raw = {}) {
  const settings = { ...DEFAULT_SETTINGS, ...raw };
  if (!getModel(settings.model)?.implemented) settings.model = DEFAULT_SETTINGS.model;
  settings.recordingHotkey =
    String(settings.recordingHotkey || V2_DEFAULT_HOTKEY).trim() || V2_DEFAULT_HOTKEY;
  settings.language = String(settings.language || "auto").trim() || "auto";
  settings.mic = String(settings.mic || "").trim();
  settings.downloadDir = String(settings.downloadDir || "").trim();
  settings.autoSubmit = Boolean(settings.autoSubmit);
  settings.onboardingDone = Boolean(settings.onboardingDone);
  settings.setupSkipped = Boolean(settings.setupSkipped);
  settings.voiceEnhance = settings.voiceEnhance !== false;
  settings.cleanupCutoffHz = normalizeCutoffHz(settings.cleanupCutoffHz);
  return settings;
}

/**
 * Legacy installs stored separate hold/toggle keys; both versions keep one `recordingHotkey`.
 * Preserves an explicit legacy hold key, else the old toggle key.
 */
export function mergeLegacyHotkey(current = {}, legacy = {}) {
  if (current.recordingHotkey) return current;
  const hold = String(legacy.hotkey ?? "").trim();
  const toggle = String(legacy.toggleHotkey ?? "").trim();
  return { ...current, recordingHotkey: hold || toggle || V2_DEFAULT_HOTKEY };
}

/** One-time migration: old default ctrl+r -> ctrl+space (unless already migrated). */
export function migrateHotkeyV2(settings) {
  if (settings.hotkeyMigratedV2) return undefined;
  if (settings.recordingHotkey !== LEGACY_DEFAULT_HOTKEY) return { hotkeyMigratedV2: true };
  return { recordingHotkey: V2_DEFAULT_HOTKEY, hotkeyMigratedV2: true };
}

/** Parse a custom cutoff entry (Hz); undefined when outside the 40-500 band. */
export function parseCutoffHz(value) {
  const parsed = Number(String(value ?? "").trim());
  if (!Number.isFinite(parsed) || parsed < 40 || parsed > 500) return undefined;
  return Math.round(parsed);
}

/** Plugin options act as initial overrides (lowest precedence: stored settings always win). */
export function optionsOverlay(options = {}) {
  const overlay = {};
  for (const key of [
    "recordingHotkey",
    "model",
    "language",
    "mic",
    "autoSubmit",
    "downloadDir",
    "voiceEnhance",
    "cleanupCutoffHz",
  ]) {
    if (options[key] !== undefined) overlay[key] = options[key];
  }
  return overlay;
}
