import { DEFAULT_SETTINGS, getModel } from "../lib/models.js";

export interface VoiceSettings {
  recordingHotkey: string;
  submitHotkey: string;
  model: string;
  language: string;
  mic: string;
  autoSubmit: boolean;
  downloadDir: string;
  onboardingDone: boolean;
  setupSkipped: boolean;
}

export type SettingsUpdate = (mutation: (draft: VoiceSettings) => void) => Promise<void> | void;

/** Same normalization rules as V1 `readSettings` (index.js:22-36). */
export function normalizeSettings(raw: Partial<VoiceSettings> = {}): VoiceSettings {
  const settings: VoiceSettings = { ...DEFAULT_SETTINGS, ...raw } as VoiceSettings;
  if (!getModel(settings.model)?.implemented) settings.model = DEFAULT_SETTINGS.model;
  settings.recordingHotkey = String(settings.recordingHotkey || DEFAULT_SETTINGS.recordingHotkey).trim() || DEFAULT_SETTINGS.recordingHotkey;
  settings.submitHotkey = String(settings.submitHotkey || "").trim();
  settings.language = String(settings.language || "auto").trim() || "auto";
  settings.mic = String(settings.mic || "").trim();
  settings.downloadDir = String(settings.downloadDir || "").trim();
  settings.autoSubmit = Boolean(settings.autoSubmit);
  settings.onboardingDone = Boolean(settings.onboardingDone);
  settings.setupSkipped = Boolean(settings.setupSkipped);
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
  return { ...current, recordingHotkey: hold || toggle || DEFAULT_SETTINGS.recordingHotkey };
}

/** Options passed via cli.json act as initial overrides (first run only). */
export function optionsOverlay(options: Record<string, unknown> = {}): Partial<VoiceSettings> {
  const overlay: Partial<VoiceSettings> = {};
  for (const key of ["recordingHotkey", "submitHotkey", "model", "language", "mic", "autoSubmit", "downloadDir"] as const) {
    if (options[key] !== undefined) (overlay as Record<string, unknown>)[key] = options[key];
  }
  return overlay;
}
