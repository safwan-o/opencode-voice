import { downloadModel } from "../lib/download.js";
import { VoiceRuntime, ensureManagedRecorder, getRecorderStatus, probeRecorder } from "../lib/engine.js";
import { getEngineStatus, installManagedEngine } from "../lib/engines.js";
import { getModel, isModelDownloaded } from "../lib/models.js";
import type { VoiceSettings } from "./settings.ts";

export type ToastFn = (message: string, variant?: "info" | "success" | "warning" | "error") => void;

export interface EnsureEnv {
  options: Record<string, unknown>;
  settings: VoiceSettings;
  toast: ToastFn;
  download?: typeof downloadModel;
  installEngine?: typeof installManagedEngine;
  ensureRecorder?: typeof ensureManagedRecorder;
}

export async function ensureDownloaded(env: EnsureEnv, model = getModel(env.settings.model)): Promise<boolean> {
  if (isModelDownloaded(model, env.options, env.settings)) return true;
  const download = env.download ?? downloadModel;
  env.toast(`Downloading ${model.name}...`);
  await download(model, env.options, env.settings, {
    retries: 5,
    onRetry: ({ error, nextAttempt, attempts }: { error: unknown; nextAttempt: number; attempts: number }) =>
      env.toast(`Download retry ${nextAttempt}/${attempts}: ${error instanceof Error ? error.message : String(error)}`, "warning"),
  });
  env.toast(`${model.name} downloaded`, "success");
  return true;
}

export async function ensureEngineReady(env: EnsureEnv, model = getModel(env.settings.model)): Promise<boolean> {
  const engineId = model.engine;
  const commandOptions = { ...env.options, downloadDir: env.settings.downloadDir };
  const current = getEngineStatus(engineId, env.options, env.settings);
  if (current.resolvedBinary) {
    const { probeEngine } = await import("../lib/engines.js");
    if ((await probeEngine(engineId, current.resolvedBinary)).ok) return true;
  }
  const install = env.installEngine ?? installManagedEngine;
  env.toast(`Installing ${engineId}...`);
  await install(engineId, commandOptions, env.settings, {
    retries: 5,
    onRetry: ({ error, nextAttempt, attempts }: { error: unknown; nextAttempt: number; attempts: number }) =>
      env.toast(`Engine install retry ${nextAttempt}/${attempts}: ${error instanceof Error ? error.message : String(error)}`, "warning"),
  });
  env.toast(`${engineId} installed`, "success");
  return true;
}

export async function ensureRecorderReady(env: EnsureEnv): Promise<boolean> {
  if (process.platform !== "win32") return true;
  const commandOptions = { ...env.options, downloadDir: env.settings.downloadDir, skipFfmpegStaticInstall: true };
  const current = getRecorderStatus(commandOptions, env.settings);
  if (current.resolvedBinary && (await probeRecorder(current.resolvedBinary)).ok) return true;
  const ensure = env.ensureRecorder ?? ensureManagedRecorder;
  env.toast("Installing local Windows recorder...");
  await ensure(commandOptions, env.settings, {
    retries: 5,
    onRetry: ({ error, nextAttempt, attempts }: { error: unknown; nextAttempt: number; attempts: number }) =>
      env.toast(`Recorder install retry ${nextAttempt}/${attempts}: ${error instanceof Error ? error.message : String(error)}`, "warning"),
  });
  env.toast("Windows recorder installed", "success");
  return true;
}

export type { VoiceRuntime };
