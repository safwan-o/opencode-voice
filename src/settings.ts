import { normalizeCutoffHz } from "../lib/enhance.js";
import { DEFAULT_SETTINGS, getModel } from "../lib/models.js";

export interface VoiceSettings {
  recordingHotkey: string;
  model: string;
  language: string;
  mic: string;
  autoSubmit: boolean;
  downloadDir: string;
  onboardingDone: boolean;
  setupSkipped: boolean;
  voiceEnhance?: boolean;
  cleanupCutoffHz?: number;
  /** One-time V2 migration off the old default (ctrl+r collides with session rename). */
  hotkeyMigratedV2?: boolean;
}

/** V2 default: ctrl+r is factory-bound to session rename, so we no longer claim it. */
export const V2_DEFAULT_HOTKEY = "ctrl+space";
const LEGACY_DEFAULT_HOTKEY = "ctrl+r";

export type SettingsUpdate = (mutation: (draft: VoiceSettings) => void) => Promise<void> | void;

/** Same normalization rules as V1 `readSettings` (index.js:22-36). */
export function normalizeSettings(raw: Partial<VoiceSettings> = {}): VoiceSettings {
  const settings: VoiceSettings = { ...DEFAULT_SETTINGS, ...raw } as VoiceSettings;
  if (!getModel(settings.model)?.implemented) settings.model = DEFAULT_SETTINGS.model;
  settings.recordingHotkey = String(settings.recordingHotkey || V2_DEFAULT_HOTKEY).trim() || V2_DEFAULT_HOTKEY;
  settings.language = String(settings.language || "auto").trim() || "auto";
  settings.mic = String(settings.mic || "").trim();
  settings.downloadDir = String(settings.downloadDir || "").trim();
  settings.autoSubmit = Boolean(settings.autoSubmit);
  settings.onboardingDone = Boolean(settings.onboardingDone);
  settings.setupSkipped = Boolean(settings.setupSkipped);
  settings.voiceEnhance = (settings as Record<string, unknown>).voiceEnhance !== false;
  settings.cleanupCutoffHz = normalizeCutoffHz((settings as Record<string, unknown>).cleanupCutoffHz);
  return settings;
}

/**
 * V1 stored separate hold/toggle keys; V2 keeps one `recordingHotkey`.
 * Preserves an explicit legacy hold key, else the old toggle key.
 */
export function mergeLegacyHotkey(current: Partial<VoiceSettings>, legacy: { hotkey?: unknown; toggleHotkey?: unknown }): Partial<VoiceSettings> {
  if (current.recordingHotkey) return current;
  const hold = String(legacy.hotkey ?? "").trim();
  const toggle = String(legacy.toggleHotkey ?? "").trim();
  return { ...current, recordingHotkey: hold || toggle || V2_DEFAULT_HOTKEY };
}

/** One-time migration: old default ctrl+r -> ctrl+space (unless already migrated). */
export function migrateHotkeyV2(settings: VoiceSettings): Partial<VoiceSettings> | undefined {
  if (settings.hotkeyMigratedV2) return undefined;
  if (settings.recordingHotkey !== LEGACY_DEFAULT_HOTKEY) return { hotkeyMigratedV2: true };
  return { recordingHotkey: V2_DEFAULT_HOTKEY, hotkeyMigratedV2: true };
}

/** Options passed via cli.json act as initial overrides (first run only). */
export function optionsOverlay(options: Record<string, unknown> = {}): Partial<VoiceSettings> {
  const overlay: Partial<VoiceSettings> = {};
  for (const key of ["recordingHotkey", "model", "language", "mic", "autoSubmit", "downloadDir", "voiceEnhance", "cleanupCutoffHz"] as const) {
    if (options[key] !== undefined) (overlay as Record<string, unknown>)[key] = options[key];
  }
  return overlay;
}
