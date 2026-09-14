import { listMicrophones, resolveCommand } from "../lib/engine.js";
import { getEngineStatus, importManagedEngine, removeManagedEngine } from "../lib/engines.js";
import { formatSize, getCacheDir, getModel, getModelPath, isModelDownloaded, isModelFilePresent, MODELS } from "../lib/models.js";
import { ensureDownloaded, ensureEngineReady, ensureRecorderReady, type ToastFn } from "./ensure.ts";
import { WHISPER_LANGUAGES } from "./languages.ts";
import { normalizeSettings, type SettingsUpdate, type VoiceSettings } from "./settings.ts";

export interface DialogApi {
  alert(options: { title: string; message: string }): Promise<void>;
  confirm(options: { title: string; message: string }): Promise<boolean | undefined>;
  prompt(options: { title: string; placeholder?: string; value?: string }): Promise<string | undefined>;
  select<Value>(options: {
    title: string;
    placeholder?: string;
    current?: Value;
    options: ReadonlyArray<{
      title: string;
      value: Value;
      description?: string;
      footer?: string;
      category?: string;
      disabled?: boolean;
    }>;
  }): Promise<Value | undefined>;
}

export interface DialogDeps {
  dialog: DialogApi;
  toast: ToastFn;
  options: Record<string, unknown>;
  getSettings: () => VoiceSettings;
  update: SettingsUpdate;
}

type D = DialogDeps;

function settingsOf(d: D): VoiceSettings {
  return normalizeSettings(d.getSettings());
}

async function set(d: D, name: keyof VoiceSettings, value: VoiceSettings[keyof VoiceSettings]): Promise<void> {
  await d.update((draft) => {
    (draft as Record<string, unknown>)[name] = value;
  });
}

function modelStatusText(model: ReturnType<typeof getModel>, options: Record<string, unknown>, settings: VoiceSettings): string {
  if (!model.implemented) return "planned";
  if (isModelFilePresent(model, options, settings) && !isModelDownloaded(model, options, settings)) return "needs verification";
  return isModelDownloaded(model, options, settings) ? "downloaded" : "not downloaded";
}

function errText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function showError(d: D, title: string, error: unknown): Promise<void> {
  await d.dialog.alert({ title, message: errText(error) });
  return showSettings(d);
}

export async function showModelPicker(d: D, firstRun = false): Promise<void> {
  const settings = settingsOf(d);
  const picked = await d.dialog.select({
    title: firstRun ? "Set up voice input: choose a local model" : "Voice model",
    placeholder: "Search voice models...",
    current: settings.model,
    options: [
      ...MODELS.map((model) => {
        const downloaded = model.implemented && isModelDownloaded(model, d.options, settings);
        return {
          title: `${downloaded ? "[downloaded]" : model.implemented ? "[download]" : "[planned]"} ${model.name} - ${formatSize(model)}`,
          value: model.id,
          category: model.implemented ? "Available now" : "Planned sidecar models",
          disabled: !model.implemented,
          description: `${model.engine} - ${model.languages} - ${modelStatusText(model, d.options, settings)}`,
          footer: model.description,
        };
      }),
      ...(firstRun
        ? [{ title: "Skip setup for now", value: "__skip", category: "Setup", description: "You can open this again with /voice-settings." }]
        : []),
    ],
  });
  if (picked === undefined) return firstRun ? undefined : showSettings(d);
  if (picked === "__skip") {
    await set(d, "onboardingDone", true);
    await set(d, "setupSkipped", true);
    d.toast("Voice setup skipped. Use /voice-settings when ready.");
    return;
  }
  const model = getModel(picked);
  if (!model?.implemented) return showModelPicker(d, firstRun);
  await set(d, "model", model.id);
  await set(d, "onboardingDone", true);
  await set(d, "setupSkipped", false);
  const next = settingsOf(d);
  const env = { options: d.options, settings: next, toast: d.toast };
  try {
    await ensureEngineReady(env, model);
    await ensureDownloaded(env, model);
  } catch (error) {
    return showError(d, "Voice setup failed", error);
  }
}

export function shouldShowStartupModelPicker(d: D): boolean {
  const settings = settingsOf(d);
  const model = getModel(settings.model);
  return !settings.onboardingDone || (!settings.setupSkipped && !isModelDownloaded(model, d.options, settings));
}

export async function showLanguagePicker(d: D): Promise<void> {
  const settings = settingsOf(d);
  const picked = await d.dialog.select({
    title: "Voice language",
    current: settings.language,
    options: [
      { title: "Auto detect", value: "auto", description: "Let Whisper detect the language." },
      ...WHISPER_LANGUAGES.map(([name, code]) => ({ title: name, value: code })),
      { title: "Custom code", value: "__custom", description: "Enter a Whisper language code manually." },
    ],
  });
  if (picked === undefined) return showTranscriptionSettings(d);
  if (picked === "__custom") {
    const value = await d.dialog.prompt({
      title: "Custom language code",
      placeholder: "ru, en, de, ...",
      value: settings.language === "auto" ? "" : settings.language,
    });
    if (value === undefined) return showLanguagePicker(d);
    await set(d, "language", value.trim() || "auto");
    return showSettings(d);
  }
  await set(d, "language", picked);
  return showSettings(d);
}

export async function showMicrophonePicker(d: D): Promise<void> {
  const settings = settingsOf(d);
  const commandOptions = { ...d.options, downloadDir: settings.downloadDir, skipFfmpegStaticInstall: true };
  const placeholder = process.platform === "win32" ? "default, audio=default, \"Microphone (Name)\"" : "default, hw:0,0, pulse, :0, ...";
  const devices = listMicrophones(commandOptions);
  const picked = await d.dialog.select({
    title: "Voice microphone",
    current: settings.mic || "",
    options: [
      { title: "System default", value: "", description: "Use the default input device." },
      ...devices.map((device) => ({ title: device, value: device })),
      { title: "Custom device", value: "__custom", description: "Enter ffmpeg/arecord device manually." },
    ],
  });
  if (picked === undefined) return showSystemSettings(d);
  if (picked === "__custom") {
    const value = await d.dialog.prompt({ title: "Custom microphone device", placeholder, value: settings.mic });
    if (value === undefined) return showMicrophonePicker(d);
    await set(d, "mic", value.trim());
    return showSettings(d);
  }
  await set(d, "mic", picked);
  return showSettings(d);
}

export async function showRecordingHotkeyPicker(d: D): Promise<void> {
  const settings = settingsOf(d);
  const presets = [
    { title: "Ctrl + Space", value: "ctrl+space", description: "Start and stop recording." },
    { title: "Ctrl + R", value: "ctrl+r", description: "Start and stop recording (clashes with session rename)." },
    { title: "Alt + R", value: "alt+r", description: "Start and stop recording." },
    { title: "Custom hotkey", value: "__custom", description: "Enter another OpenCode keybinding." },
  ];
  const picked = await d.dialog.select({
    title: "Record key",
    current: presets.some((p) => p.value === settings.recordingHotkey) ? settings.recordingHotkey : "__custom",
    options: presets,
  });
  if (picked === undefined) return showRecordingSettings(d);
  if (picked === "__custom") {
    const value = await d.dialog.prompt({ title: "Custom recording key", placeholder: "alt+shift+r", value: settings.recordingHotkey });
    if (value === undefined) return showRecordingHotkeyPicker(d);
    // Keymap layer is reactive: it re-reads the store, no manual re-register.
    await set(d, "recordingHotkey", value.trim() || settings.recordingHotkey);
    return showRecordingSettings(d);
  }
  await set(d, "recordingHotkey", picked);
  return showRecordingSettings(d);
}

export async function showDiagnostics(d: D): Promise<void> {
  const settings = settingsOf(d);
  const model = getModel(settings.model);
  const commandOptions = { ...d.options, downloadDir: settings.downloadDir, skipFfmpegStaticInstall: true };
  const lines = [
    `Platform: ${process.platform}-${process.arch}`,
    `Recorder: ffmpeg=${resolveCommand("ffmpeg", commandOptions) ? "yes" : "no"}, arecord=${resolveCommand("arecord", commandOptions) ? "yes" : "no"}, sox=${resolveCommand("sox", commandOptions) ? "yes" : "no"}`,
    `Engine: ${getEngineStatus(model.engine, d.options, settings).id} (${getEngineStatus(model.engine, d.options, settings).source})`,
    `Active model: ${model.name} (${isModelDownloaded(model, d.options, settings) ? "downloaded" : "not downloaded"})`,
    `Model path: ${getModelPath(model, d.options, settings)}`,
    `Cache dir: ${getCacheDir(d.options, settings)}`,
  ];
  await d.dialog.alert({ title: "Voice diagnostics", message: lines.join("\n") });
  return showSettings(d);
}

export async function showEngineManager(d: D, engineId = getModel(settingsOf(d).model).engine): Promise<void> {
  const settings = settingsOf(d);
  const status = getEngineStatus(engineId, d.options, settings);
  const canImport = Boolean(status.resolvedBinary && status.source !== "managed");
  const picked = await d.dialog.select({
    title: `Native engine (${status.source})`,
    options: [
      {
        title: `Use detected ${status.command} as managed engine`,
        value: "import",
        description: canImport ? status.resolvedBinary : `No external ${status.command} detected`,
        disabled: !canImport,
      },
      { title: `Install managed ${engineId}`, value: "install", description: "Download the matching native engine from GitHub Releases." },
      {
        title: "Remove managed engine",
        value: "remove",
        description: status.managedInstalled ? status.managedBinary : "No managed engine installed",
        disabled: !status.managedInstalled,
      },
      { title: "Diagnostics", value: "diagnostics", description: "Show recorder, model, and engine paths." },
      { title: "Back", value: "back" },
    ],
  });
  if (picked === undefined || picked === "back") return showSettings(d);
  if (picked === "diagnostics") return showDiagnostics(d);
  if (picked === "import") {
    try {
      const result = await importManagedEngine(engineId, status.resolvedBinary as string, d.options, settings);
      d.toast(`Managed engine imported: ${result.managedBinary}`, "success");
      return showEngineManager(d, engineId);
    } catch (error) {
      return showError(d, "Engine import failed", error);
    }
  }
  if (picked === "install") {
    try {
      await ensureEngineReady({ options: d.options, settings, toast: d.toast }, { engine: engineId } as ReturnType<typeof getModel>);
      return showEngineManager(d, engineId);
    } catch (error) {
      return showError(d, "Engine install failed", error);
    }
  }
  if (picked === "remove") {
    const ok = await d.dialog.confirm({ title: "Remove managed engine?", message: status.managedBinary });
    if (!ok) return showEngineManager(d, engineId);
    try {
      await removeManagedEngine(engineId, d.options, settings);
      d.toast("Managed engine removed");
      return showEngineManager(d, engineId);
    } catch (error) {
      return showError(d, "Engine remove failed", error);
    }
  }
}

export async function showRecordingSettings(d: D): Promise<void> {
  const settings = settingsOf(d);
  const picked = await d.dialog.select({
    title: "Recording",
    options: [
      { title: "Record key", value: "key", description: settings.recordingHotkey || "not set" },
      { title: "Toggle recording", value: "toggle", description: "Press once to start and again to transcribe.", disabled: true },
      { title: "Hold to talk", value: "hold", description: "Unavailable until OpenCode provides key-release events.", disabled: true },
    ],
  });
  if (picked === undefined) return showSettings(d);
  if (picked === "key") return showRecordingHotkeyPicker(d);
  return showRecordingSettings(d);
}

export async function showTranscriptionSettings(d: D): Promise<void> {
  const settings = settingsOf(d);
  const model = getModel(settings.model);
  const downloaded = isModelDownloaded(model, d.options, settings);
  const picked = await d.dialog.select({
    title: "Transcription",
    options: [
      { title: "Model", value: "model", description: `${model.name} · ${downloaded ? "ready" : "not downloaded"}` },
      { title: downloaded ? "Re-download model" : "Download model", value: "download", description: `${model.name} · ${formatSize(model)}` },
      { title: "Language", value: "language", description: settings.language === "auto" ? "auto detect" : settings.language },
      { title: "Auto-submit", value: "autoSubmit", description: settings.autoSubmit ? "enabled" : "disabled" },
      { title: "Submit key", value: "submitHotkey", description: settings.submitHotkey || "disabled" },
    ],
  });
  if (picked === undefined) return showSettings(d);
  if (picked === "model") return showModelPicker(d, false);
  if (picked === "download") {
    try {
      const env = { options: d.options, settings, toast: d.toast };
      await ensureEngineReady(env, model);
      await ensureDownloaded(env, model);
      return showSettings(d);
    } catch (error) {
      return showError(d, "Model download failed", error);
    }
  }
  if (picked === "language") return showLanguagePicker(d);
  if (picked === "autoSubmit") {
    await set(d, "autoSubmit", !settings.autoSubmit);
    return showTranscriptionSettings(d);
  }
  if (picked === "submitHotkey") {
    const value = await d.dialog.prompt({ title: "Submit recording key", placeholder: "leader r or empty to disable", value: settings.submitHotkey });
    if (value === undefined) return showTranscriptionSettings(d);
    await set(d, "submitHotkey", value.trim());
    return showTranscriptionSettings(d);
  }
}

export async function showSystemSettings(d: D): Promise<void> {
  const settings = settingsOf(d);
  const model = getModel(settings.model);
  const picked = await d.dialog.select({
    title: "Audio and system",
    options: [
      { title: "Microphone", value: "mic", description: settings.mic || "system default" },
      { title: "Download directory", value: "downloadDir", description: settings.downloadDir || getCacheDir(d.options, settings) },
      { title: "Native engine", value: "engine", description: `${getEngineStatus(model.engine, d.options, settings).source} · ${model.engine}` },
      { title: "Diagnostics", value: "diagnostics", description: "Check recorder, runtimes, and model paths." },
      { title: "Run setup again", value: "firstRun", description: "Open the first-run model picker." },
    ],
  });
  if (picked === undefined) return showSettings(d);
  if (picked === "mic") return showMicrophonePicker(d);
  if (picked === "downloadDir") {
    const value = await d.dialog.prompt({ title: "Download directory", placeholder: "~/.cache/opencode-voice", value: settings.downloadDir });
    if (value === undefined) return showSystemSettings(d);
    await set(d, "downloadDir", value.trim());
    return showSystemSettings(d);
  }
  if (picked === "engine") return showEngineManager(d);
  if (picked === "diagnostics") return showDiagnostics(d);
  if (picked === "firstRun") return showModelPicker(d, true);
}

export async function showSettings(d: D): Promise<void> {
  const settings = settingsOf(d);
  const model = getModel(settings.model);
  const picked = await d.dialog.select({
    title: "Voice settings",
    options: [
      { title: "Recording", value: "recording", description: `${settings.recordingHotkey} · toggle` },
      { title: "Transcription", value: "transcription", description: `${model.name} · ${settings.language === "auto" ? "auto language" : settings.language}` },
      { title: "Audio and system", value: "system", description: `${settings.mic || "default microphone"} · ${model.engine}` },
    ],
  });
  if (picked === undefined) return;
  if (picked === "recording") return showRecordingSettings(d);
  if (picked === "transcription") return showTranscriptionSettings(d);
  if (picked === "system") return showSystemSettings(d);
}
