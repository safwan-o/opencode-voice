// Thin V2 wrapper over the shared lib/ implementation (plain JS so both
// OpenCode loaders consume one copy). Types stay here; logic lives in lib/settings.js.
export {
  V2_DEFAULT_HOTKEY,
  mergeLegacyHotkey,
  migrateHotkeyV2,
  normalizeSettings,
  optionsOverlay,
} from "../lib/settings.js";

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
  /** One-time migration off the old default (ctrl+r collides with session rename). */
  hotkeyMigratedV2?: boolean;
}

export type SettingsUpdate = (mutation: (draft: VoiceSettings) => void) => Promise<void> | void;
