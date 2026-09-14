import { getModel, isModelDownloaded } from "../lib/models.js";
import { ensureDownloaded, ensureEngineReady, ensureRecorderReady, type ToastFn, type VoiceRuntime } from "./ensure.ts";
import { normalizeSettings, type VoiceSettings } from "./settings.ts";

export interface VoiceControllerDeps {
  runtime: VoiceRuntime;
  options: Record<string, unknown>;
  getSettings: () => VoiceSettings;
  toast: ToastFn;
  /** Deliver transcribed text (V2: submit via session.prompt, or dialog fallback). */
  deliver: (text: string, submit: boolean) => Promise<void>;
  /** Show a blocking setup error (V2: alert dialog returning to settings). */
  onSetupError: (title: string, error: unknown) => void;
  ready?: {
    isModelDownloaded?: typeof isModelDownloaded;
    ensureDownloaded?: typeof ensureDownloaded;
    ensureEngineReady?: typeof ensureEngineReady;
    ensureRecorderReady?: typeof ensureRecorderReady;
  };
}

function errText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function createVoiceController(deps: VoiceControllerDeps) {
  const ready = deps.ready ?? {};

  async function prepare(): Promise<{ settings: VoiceSettings; model: ReturnType<typeof getModel> } | undefined> {
    const settings = normalizeSettings(deps.getSettings());
    const model = getModel(settings.model);
    const downloaded = (ready.isModelDownloaded ?? isModelDownloaded)(model, deps.options, settings);
    if (!downloaded) {
      try {
        const env = { options: deps.options, settings, toast: deps.toast };
        await (ready.ensureEngineReady ?? ensureEngineReady)(env, model);
        await (ready.ensureDownloaded ?? ensureDownloaded)(env, model);
      } catch (error) {
        deps.onSetupError("Voice setup failed", error);
        return undefined;
      }
    }
    try {
      const env = { options: deps.options, settings, toast: deps.toast };
      await (ready.ensureEngineReady ?? ensureEngineReady)(env, model);
      await (ready.ensureRecorderReady ?? ensureRecorderReady)(env);
    } catch (error) {
      deps.onSetupError("Voice runtime setup failed", error);
      return undefined;
    }
    return { settings, model };
  }

  async function start(submit = false): Promise<void> {
    if (deps.runtime.isTranscribing()) return deps.toast("Transcription is already running", "warning");
    if (deps.runtime.isRecording()) return;
    const state = await prepare();
    if (!state) return;
    try {
      deps.runtime.pendingSubmit = submit || state.settings.autoSubmit;
      await deps.runtime.start(state.settings);
      deps.toast(submit ? "Recording for submit. Run /voice-submit again to stop." : "Recording. Run /voice again to stop.");
    } catch (error) {
      deps.toast(errText(error), "error");
    }
  }

  async function finish(submit = false): Promise<void> {
    if (!deps.runtime.isRecording()) return;
    await stopAndTranscribe(submit || deps.runtime.pendingSubmit);
    deps.runtime.pendingSubmit = false;
  }

  async function stopAndTranscribe(submit: boolean): Promise<void> {
    if (deps.runtime.isTranscribing()) return deps.toast("Transcription is already running", "warning");
    try {
      const settings = normalizeSettings(deps.getSettings());
      const model = getModel(settings.model);
      const audioFile = await deps.runtime.stop();
      if (!audioFile) return;
      deps.toast("Transcribing...");
      const text = await deps.runtime.transcribe(audioFile, model, settings);
      await deps.deliver(text, submit || settings.autoSubmit);
      deps.toast(submit || settings.autoSubmit ? "Transcribed and submitted" : "Transcribed", "success");
    } catch (error) {
      deps.toast(errText(error), "error");
    }
  }

  async function toggle(submit = false): Promise<void> {
    if (deps.runtime.isTranscribing()) return deps.toast("Transcription is already running", "warning");
    if (deps.runtime.isRecording()) return finish(submit);
    return start(submit);
  }

  function cancel(): void {
    deps.runtime.cancel();
    deps.toast("Voice recording cancelled");
  }

  return { start, finish, toggle, cancel, stopAndTranscribe };
}

export type VoiceController = ReturnType<typeof createVoiceController>;
