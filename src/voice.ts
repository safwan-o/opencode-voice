// Typed V2 facade over the shared lib/ controller (plain JS so both loaders
// consume one copy). All logic lives in lib/voice-controller.js.
import { isModelDownloaded } from "../lib/models.js";
import { createVoiceController as createShared } from "../lib/voice-controller.js";
import {
  ensureDownloaded,
  ensureEngineReady,
  ensureRecorderReady,
  type ToastFn,
  type VoiceRuntime,
} from "./ensure.ts";
import { type VoiceSettings } from "./settings.ts";

export interface VoiceControllerDeps {
  runtime: VoiceRuntime;
  options: Record<string, unknown>;
  getSettings: () => VoiceSettings;
  toast: ToastFn;
  /** Deliver transcribed text (V2: submit via session.prompt, or dialog fallback). */
  deliver: (text: string, submit: boolean) => Promise<void>;
  /** Show a blocking setup error (V2: alert dialog returning to settings). */
  onSetupError: (title: string, error: unknown) => void;
  /** V1-only toast hints (V2 never passes hold, so this stays undefined). */
  hints?: {
    holdStart?: (key: string) => string;
  };
  ready?: {
    isModelDownloaded?: typeof isModelDownloaded;
    ensureDownloaded?: typeof ensureDownloaded;
    ensureEngineReady?: typeof ensureEngineReady;
    ensureRecorderReady?: typeof ensureRecorderReady;
  };
}

export function createVoiceController(deps: VoiceControllerDeps) {
  return createShared({
    ...deps,
    ready: {
      isModelDownloaded,
      ensureDownloaded,
      ensureEngineReady,
      ensureRecorderReady,
      ...deps.ready,
    },
  });
}

export type VoiceController = ReturnType<typeof createVoiceController>;
