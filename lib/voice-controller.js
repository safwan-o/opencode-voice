// Shared voice controller (canonical home; plain JS so lib/ stays .ts-free).
// Single-flight phase lock + setup flow, consumed by the V1 adapter (index.js)
// directly and re-exported by src/voice.ts for V2. Adapters inject deliver,
// setup-error display, and (V1-only) hold-to-talk toast hints.
//
// deps: { runtime, options, getSettings, toast, deliver, onSetupError, hints?, ready? }
// ready.ensure* (Downloaded/EngineReady/RecorderReady) is REQUIRED: lib/ cannot
// import the TS ensure modules, so each adapter supplies its own flavor
// (V1: dialog-rich index.js locals; V2: src/ensure.ts via the src/voice.ts wrapper).
import { getModel, isModelDownloaded } from "./models.js";
import { normalizeSettings } from "./settings.js";

function errText(error) {
  return error instanceof Error ? error.message : String(error);
}

export function createVoiceController(deps) {
  const ready = deps.ready ?? {};
  for (const name of ["ensureDownloaded", "ensureEngineReady", "ensureRecorderReady"]) {
    if (typeof ready[name] !== "function") {
      throw new Error(`voice-controller: ready.${name} is required`);
    }
  }

  // Single-flight guard: every entry checks AND sets this synchronously,
  // before any await, so concurrent presses cannot slip through the gaps
  // between runtime-flag reads and the state changes that follow them.
  let phase = "idle";

  async function prepare() {
    const settings = normalizeSettings(deps.getSettings());
    const model = getModel(settings.model);
    const downloaded = (ready.isModelDownloaded ?? isModelDownloaded)(
      model,
      deps.options,
      settings,
    );
    if (!downloaded) {
      try {
        const env = { options: deps.options, settings, toast: deps.toast };
        await ready.ensureEngineReady(env, model);
        await ready.ensureDownloaded(env, model);
      } catch (error) {
        deps.onSetupError("Voice setup failed", error);
        return undefined;
      }
    }
    try {
      const env = { options: deps.options, settings, toast: deps.toast };
      await ready.ensureEngineReady(env, model);
      await ready.ensureRecorderReady(env);
    } catch (error) {
      deps.onSetupError("Voice runtime setup failed", error);
      return undefined;
    }
    return { settings, model };
  }

  async function start(submit = false, hold = false) {
    if (phase === "starting") return deps.toast("Starting…");
    if (phase === "transcribing" || deps.runtime.isTranscribing()) {
      return deps.toast("Transcription is already running", "warning");
    }
    if (phase === "recording" || phase === "stopping" || deps.runtime.isRecording()) return;
    phase = "starting";
    const state = await prepare();
    if (!state) {
      phase = "idle";
      return;
    }
    try {
      deps.runtime.pendingSubmit = submit || state.settings.autoSubmit;
      await deps.runtime.start(state.settings);
      phase = "recording";
      deps.toast(
        hold
          ? (deps.hints?.holdStart?.(state.settings.recordingHotkey || "the recording key") ??
            "Recording.")
          : submit
            ? "Recording for submit. Run /voice-submit again to stop."
            : "Recording. Run /voice again to stop.",
      );
    } catch (error) {
      phase = "idle";
      deps.toast(errText(error), "error");
    }
  }

  async function finish(submit = false) {
    if (phase === "stopping") return deps.toast("Stopping…");
    if (phase === "transcribing" || deps.runtime.isTranscribing()) {
      return deps.toast("Transcription is already running", "warning");
    }
    if (phase !== "recording" && !deps.runtime.isRecording()) return;
    // stopAndTranscribe owns the stopping transition (it sets the phase
    // synchronously on entry, so concurrent finishes cannot slip through).
    await stopAndTranscribe(submit || deps.runtime.pendingSubmit);
    deps.runtime.pendingSubmit = false;
  }

  async function stopAndTranscribe(submit) {
    if (phase === "stopping") return deps.toast("Stopping…");
    if (phase === "transcribing" || deps.runtime.isTranscribing()) {
      return deps.toast("Transcription is already running", "warning");
    }
    phase = "stopping";
    try {
      const settings = normalizeSettings(deps.getSettings());
      const model = getModel(settings.model);
      const audioFile = await deps.runtime.stop();
      if (!audioFile) {
        phase = "idle";
        return;
      }
      phase = "transcribing";
      deps.toast("Transcribing...");
      const text = await deps.runtime.transcribe(audioFile, model, settings);
      await deps.deliver(text, submit || settings.autoSubmit);
      deps.toast(
        submit || settings.autoSubmit ? "Transcribed and submitted" : "Transcribed",
        "success",
      );
      phase = "idle";
    } catch (error) {
      // A failed stop() leaves the runtime recording, so go back to
      // recording (next press completes it); anything else goes idle.
      phase = deps.runtime.isRecording() ? "recording" : "idle";
      deps.toast(errText(error), "error");
    }
  }

  async function toggle(submit = false) {
    if (phase === "transcribing" || deps.runtime.isTranscribing()) {
      return deps.toast("Transcription is already running", "warning");
    }
    if (phase === "stopping") return deps.toast("Stopping…");
    if (phase === "starting") return deps.toast("Starting…");
    if (phase === "recording" || deps.runtime.isRecording()) return finish(submit);
    return start(submit);
  }

  function cancel() {
    deps.runtime.cancel();
    phase = "idle";
    deps.toast("Voice recording cancelled");
  }

  return { start, finish, toggle, cancel, stopAndTranscribe };
}
