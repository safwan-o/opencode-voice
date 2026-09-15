import { Plugin } from "@opencode/plugin/tui";
import { VoiceRuntime } from "../lib/engine.js";
import { DEFAULT_SETTINGS } from "../lib/models.js";
import { copyText } from "./clipboard.ts";
import { showError, showModelPicker, showSettings, shouldShowStartupModelPicker } from "./dialogs.ts";
import { normalizeSettings, migrateHotkeyV2, optionsOverlay } from "./settings.ts";
import { createVoiceController } from "./voice.ts";

export default Plugin.define({
  id: "opencode-voice",
  setup(ctx) {
    const createRuntime =
      (ctx.options?.createRuntime as ((options: Record<string, unknown>) => VoiceRuntime) | undefined) ??
      ((o: Record<string, unknown>) => new VoiceRuntime(o));
    const runtime = createRuntime((ctx.options ?? {}) as Record<string, unknown>);

    const [store, updateStore] = ctx.storage.store("settings", {
      initial: { ...DEFAULT_SETTINGS, ...optionsOverlay((ctx.options ?? {}) as Record<string, unknown>) },
    });
    const getSettings = () => normalizeSettings(store as unknown as Parameters<typeof normalizeSettings>[0]);
    const update = async (fn: (draft: Parameters<Parameters<typeof updateStore>[0]>[0]) => void) => {
      await updateStore(fn as Parameters<typeof updateStore>[0]);
    };

    const notify = (message: string, variant: "info" | "success" | "warning" | "error" = "info") =>
      ctx.ui.toast.show({ title: "Voice", message, variant });

    // One-time: move installs off the old ctrl+r default (session rename owns it).
    {
      const migration = migrateHotkeyV2(normalizeSettings(store as unknown as Parameters<typeof normalizeSettings>[0]));
      if (migration && migration.recordingHotkey) {
        const patch = migration;
        void updateStore((draft) => {
          Object.assign(draft, patch);
        }).then(() => notify("Voice record key moved to ctrl+space (ctrl+r is session rename). Change it in /voice-settings."));
      } else if (migration) {
        const patch = migration;
        void updateStore((draft) => {
          Object.assign(draft, patch);
        });
      }
    }

    const deps = {
      dialog: ctx.ui.dialog,
      toast: notify,
      options: (ctx.options ?? {}) as Record<string, unknown>,
      getSettings,
      update,
    };

    const currentSessionID = (): string | undefined => {
      const route = ctx.ui.router.current();
      return route?.type === "session" ? route.sessionID : undefined;
    };

    // Test seam: ctx.options.clipboard overrides the OS clipboard writer.
    const clipboard = (
      (ctx.options ?? {}) as Record<string, unknown>
    ).clipboard as { copyText?: typeof copyText } | undefined;
    const copy = clipboard?.copyText ?? copyText;
    // No composer-append API exists in V2: OFF copies to the OS clipboard
    // (user pastes where they want), ON submits immediately.
    const deliver = async (text: string, submit: boolean): Promise<void> => {
      const next = text.endsWith(" ") ? text : `${text} `;
      if (submit) {
        const sessionID = currentSessionID();
        if (!sessionID) {
          try {
            await copy(next);
          } catch (error) {
            notify(error instanceof Error ? error.message : String(error), "error");
            return;
          }
          notify("Transcription is in clipboard.");
          return;
        }
        await ctx.client.session.prompt({ sessionID, text: next });
        return;
      }
      try {
        await copy(next);
      } catch (error) {
        notify(error instanceof Error ? error.message : String(error), "error");
        return;
      }
      notify("Transcription is in clipboard.");
    };

    const controller = createVoiceController({
      runtime,
      options: (ctx.options ?? {}) as Record<string, unknown>,
      getSettings,
      toast: notify,
      deliver,
      onSetupError: (title, error) => void showError(deps, title, error),
      // Test seam: ctx.options.ready overrides lib-backed readiness checks.
      ready: ((ctx.options ?? {}) as Record<string, unknown>).ready as Parameters<typeof createVoiceController>[0]["ready"],
    });

    const openSettings = () => void showSettings(deps);

    // keymap.layer needs Solid component context (else "Keymap.Provider is
    // missing"): register it from the app slot's render function.
    const stopSlot = ctx.ui.slot({
      append: "app",
      render: () => {
        ctx.keymap.layer(() => {
          const settings = getSettings();
          return {
            mode: "global",
            priority: 100,
            commands: [
          {
            id: "voice.record",
            title: "Voice: record",
            description: "Toggle local voice recording and submit transcription.",
            group: "Voice",
            bind: settings.recordingHotkey || false,
            palette: true as const,
            slash: { name: "voice", aliases: ["voice-record"] },
            run: () => controller.toggle(false),
          },
          {
            id: "voice.submit",
            title: "Voice: submit",
            description: "Toggle local voice recording and submit after transcription.",
            group: "Voice",
            palette: true as const,
            slash: { name: "voice-submit" },
            run: () => controller.toggle(true),
          },
          {
            id: "voice.stop",
            title: "Voice: stop",
            description: "Cancel active voice recording or transcription.",
            group: "Voice",
            palette: true as const,
            slash: { name: "voice-stop" },
            run: () => controller.cancel(),
          },
          {
            id: "voice.settings",
            title: "Voice: settings",
            description: "Open local voice input settings.",
            group: "Voice",
            palette: true as const,
            slash: { name: "voice-settings" },
            run: openSettings,
          },
        ],
        bindings: ["voice.record"],
          };
        });
        return null;
      },
    });

    if (shouldShowStartupModelPicker(deps)) void showModelPicker(deps, true);

    return () => {
      stopSlot();
      runtime.cancel();
    };
  },
});
