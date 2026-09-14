import { Plugin } from "@opencode/plugin/tui";
import { VoiceRuntime } from "../lib/engine.js";

export default Plugin.define({
  id: "opencode-voice",
  setup(ctx) {
    const runtime = new VoiceRuntime((ctx.options ?? {}) as Record<string, unknown>);

    ctx.ui.toast.show({
      title: "Voice",
      message: "V2 scaffold loaded (full port in Phase3)",
      variant: "info",
    });

    return () => {
      runtime.cancel();
    };
  },
});
