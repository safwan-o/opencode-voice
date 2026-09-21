// V1 adapter harness: drives the real tui() init with a mocked V1 api.
// Mirrors test/tui-v2.test.js. Sections: A init/registration, B toggle cycles
// (stub runtime + stub ready via the options.createRuntime/options.ready seams),
// C setup flows, D dialog flows, E startup picker. Fully hermetic: no mic,
// model, network, or binaries touched.
import assert from "node:assert/strict";
import { mock, test } from "node:test";
import plugin from "../index.js";

function stubRuntime() {
  return {
    recording: false,
    transcribing: false,
    pendingSubmit: false,
    starts: 0,
    async start() {
      this.recording = true;
      this.starts += 1;
    },
    async stop() {
      this.recording = false;
      return "/tmp/voice-test.wav";
    },
    async transcribe() {
      return "hello world";
    },
    cancel() {
      this.recording = false;
    },
    isRecording() {
      return this.recording;
    },
    isTranscribing() {
      return this.transcribing;
    },
  };
}

function stubReady(overrides = {}) {
  return {
    isModelDownloaded: () => true,
    ensureDownloaded: async () => true,
    ensureEngineReady: async () => true,
    ensureRecorderReady: async () => true,
    ...overrides,
  };
}

function mockApi(kvInitial = {}) {
  const store = { ...kvInitial };
  const toasts = [];
  const selects = [];
  const prompts = [];
  const confirms = [];
  const alerts = [];
  const layers = [];
  const appended = [];
  let submitted = 0;
  const api = {
    kv: {
      get: (key, fallback) => (key in store ? store[key] : fallback),
      set: (key, value) => {
        store[key] = value;
      },
    },
    ui: {
      toast: (t) => {
        toasts.push(t);
      },
      dialog: {
        setSize: () => {},
        replace: (render) => render(),
        clear: () => {},
      },
      DialogAlert: (p) => {
        alerts.push(p);
        return {};
      },
      DialogSelect: (p) => {
        selects.push(p);
        return {};
      },
      DialogPrompt: (p) => {
        prompts.push(p);
        return {};
      },
      DialogConfirm: (p) => {
        confirms.push(p);
        return {};
      },
    },
    keymap: {
      registerLayer: (l) => {
        layers.push(l);
        return () => {};
      },
    },
    lifecycle: { onDispose: () => {} },
    client: {
      tui: {
        appendPrompt: async ({ text }) => {
          appended.push(text);
        },
        submitPrompt: async () => {
          submitted += 1;
        },
      },
    },
  };
  return {
    api,
    store,
    toasts,
    selects,
    prompts,
    confirms,
    alerts,
    layers,
    appended,
    submitted: () => submitted,
  };
}

const last = (arr) => arr[arr.length - 1];
const cmd = (layers, name) => last(layers).commands.find((c) => c.name === name);

// ---- A. init / registration ----

test("V1 init registers six commands with slash names", async () => {
  const m = mockApi();
  await plugin.tui(m.api, {});
  const names = last(m.layers).commands.map((c) => c.name);
  for (const n of [
    "voice.hold.start",
    "voice.hold.finish",
    "voice.record",
    "voice.submit",
    "voice.stop",
    "voice.settings",
  ]) {
    assert.ok(names.includes(n), `missing command ${n}`);
  }
  const slash = Object.fromEntries(
    last(m.layers)
      .commands.filter((c) => c.slashName)
      .map((c) => [c.slashName, c.name]),
  );
  assert.deepEqual(slash, {
    voice: "voice.record",
    "voice-submit": "voice.submit",
    "voice-stop": "voice.stop",
    "voice-settings": "voice.settings",
  });
  assert.equal(last(m.layers).priority, 100);
});

test("V1 init migrates fresh installs to ctrl+space", async () => {
  const m = mockApi();
  await plugin.tui(m.api, {});
  assert.equal(m.store["voice.hotkeyMigratedV2"], true);
  assert.deepEqual(last(m.layers).bindings, [
    {
      key: "ctrl+space",
      event: "press",
      preventDefault: true,
      cmd: "voice.record",
      desc: "Toggle voice recording",
    },
  ]);
});

test("V1 submitHotkey binding appears only when set", async () => {
  const plain = mockApi();
  await plugin.tui(plain.api, {});
  assert.ok(!last(plain.layers).bindings.some((b) => b.cmd === "voice.submit"));

  const m = mockApi({ "voice.submitHotkey": "leader r" });
  await plugin.tui(m.api, {});
  assert.ok(last(m.layers).bindings.some((b) => b.cmd === "voice.submit" && b.key === "leader r"));
});

test("V1 hold commands stay hidden", async () => {
  const m = mockApi();
  await plugin.tui(m.api, {});
  for (const n of ["voice.hold.start", "voice.hold.finish"]) {
    assert.equal(cmd(m.layers, n).hidden, true, n);
  }
});

// ---- B. toggle cycles (stub runtime + stub ready) ----

function riggedApi(kvInitial = {}, readyOverrides = {}) {
  const m = mockApi(kvInitial);
  const runtime = stubRuntime();
  const options = {
    createRuntime: () => runtime,
    ready: stubReady(readyOverrides),
  };
  return { ...m, runtime, options };
}

test("V1 record toggle appends without submitting", async () => {
  const m = riggedApi();
  await plugin.tui(m.api, m.options);
  await cmd(m.layers, "voice.record").run();
  await cmd(m.layers, "voice.record").run();
  assert.deepEqual(m.appended, ["hello world "]);
  assert.equal(m.submitted(), 0);
});

test("V1 submit toggle appends and submits", async () => {
  const m = riggedApi();
  await plugin.tui(m.api, m.options);
  await cmd(m.layers, "voice.submit").run();
  await cmd(m.layers, "voice.submit").run();
  assert.deepEqual(m.appended, ["hello world "]);
  assert.equal(m.submitted(), 1);
});

test("V1 autoSubmit submits without review", async () => {
  const m = riggedApi({ "voice.autoSubmit": true });
  await plugin.tui(m.api, m.options);
  await cmd(m.layers, "voice.record").run();
  await cmd(m.layers, "voice.record").run();
  assert.equal(m.submitted(), 1);
});

test("V1 busy runtime warns instead of starting", async () => {
  const m = riggedApi();
  await plugin.tui(m.api, m.options);
  m.runtime.transcribing = true;
  await cmd(m.layers, "voice.record").run();
  assert.ok(
    m.toasts.some((t) => t.message === "Transcription is already running"),
    JSON.stringify(m.toasts),
  );
  assert.deepEqual(m.appended, []);
});

test("V1 hold start toasts the release hint", async () => {
  const m = riggedApi();
  await plugin.tui(m.api, m.options);
  await cmd(m.layers, "voice.hold.start").run();
  assert.ok(
    m.toasts.some((t) => t.message === "Recording. Release ctrl+space to stop."),
    JSON.stringify(m.toasts),
  );
  await cmd(m.layers, "voice.hold.finish").run();
  assert.deepEqual(m.appended, ["hello world "]);
});

test("V1 stop cancels without transcribing", async () => {
  const m = riggedApi();
  await plugin.tui(m.api, m.options);
  await cmd(m.layers, "voice.record").run();
  await cmd(m.layers, "voice.stop").run();
  assert.deepEqual(m.appended, []);
  assert.ok(m.toasts.some((t) => t.message === "Voice recording cancelled"));
});

// ---- C. setup flows ----

test("V1 missing model provisions then records", async () => {
  const calls = [];
  const m = riggedApi(
    {},
    {
      isModelDownloaded: () => false,
      ensureEngineReady: async () => void calls.push("engine"),
      ensureDownloaded: async () => void calls.push("download"),
    },
  );
  await plugin.tui(m.api, m.options);
  await cmd(m.layers, "voice.record").run();
  await cmd(m.layers, "voice.record").run();
  assert.deepEqual(m.appended, ["hello world "]);
  assert.ok(calls.includes("engine") && calls.includes("download"));
});

test("V1 download failure shows setup error and never starts", async () => {
  const m = riggedApi(
    {},
    {
      isModelDownloaded: () => false,
      ensureDownloaded: async () => {
        throw new Error("no network");
      },
    },
  );
  await plugin.tui(m.api, m.options);
  await cmd(m.layers, "voice.record").run();
  assert.equal(last(m.alerts).title, "Voice setup failed");
  assert.equal(m.runtime.starts, 0);
  assert.deepEqual(m.appended, []);
});

// ---- D. dialog flows ----

async function openRecording(m) {
  await cmd(m.layers, "voice.settings").run();
  await last(m.selects).onSelect({ value: "recording" });
  return last(m.selects);
}

test("V1 recording rows, cleanup toggle, cutoff preset", async () => {
  const m = mockApi();
  await plugin.tui(m.api, {});
  const rec = await openRecording(m);
  const rows = Object.fromEntries(rec.options.map((o) => [o.value, o]));
  assert.equal(rows.cleanup.description, "enabled");
  assert.equal(rows.cutoff.description, "120 Hz");
  await rec.onSelect({ value: "cleanup" });
  assert.equal(m.store["voice.voiceEnhance"], false);
  await last(m.selects).onSelect({ value: "cleanup" });
  assert.equal(m.store["voice.voiceEnhance"], true);
  await last(m.selects).onSelect({ value: "cutoff" });
  assert.equal(last(m.selects).title, "Rumble filter cutoff");
  await last(m.selects).onSelect({ value: "180" });
  assert.equal(m.store["voice.cleanupCutoffHz"], 180);
});

test("V1 custom cutoff validates and keeps old value on reject", async () => {
  const m = mockApi();
  await plugin.tui(m.api, {});
  await openRecording(m);
  await last(m.selects).onSelect({ value: "cutoff" });
  await last(m.selects).onSelect({ value: "__custom" });
  await last(m.prompts).onConfirm("90");
  assert.equal(m.store["voice.cleanupCutoffHz"], 90);
  await last(m.selects).onSelect({ value: "cutoff" });
  await last(m.selects).onSelect({ value: "__custom" });
  await last(m.prompts).onConfirm("abc");
  assert.ok(m.toasts.some((t) => t.message === "Cutoff must be 40-500 Hz."));
  assert.equal(m.store["voice.cleanupCutoffHz"], 90);
});

test("V1 hotkey change re-registers the layer", async () => {
  const m = mockApi();
  await plugin.tui(m.api, {});
  assert.equal(m.layers.length, 1);
  await openRecording(m);
  await last(m.selects).onSelect({ value: "key" });
  await last(m.selects).onSelect({ value: "__custom" });
  await last(m.prompts).onConfirm("alt+g");
  assert.equal(m.layers.length, 2);
  assert.ok(last(m.layers).bindings.some((b) => b.cmd === "voice.record" && b.key === "alt+g"));
});

test("V1 transcription autoSubmit toggle flips and persists", async () => {
  const m = mockApi();
  await plugin.tui(m.api, {});
  await cmd(m.layers, "voice.settings").run();
  await last(m.selects).onSelect({ value: "transcription" });
  await last(m.selects).onSelect({ value: "autoSubmit" });
  assert.equal(m.store["voice.autoSubmit"], true);
});

test("V1 submitHotkey row survives parity work", async () => {
  const m = mockApi();
  await plugin.tui(m.api, {});
  await cmd(m.layers, "voice.settings").run();
  await last(m.selects).onSelect({ value: "transcription" });
  const rows = Object.fromEntries(last(m.selects).options.map((o) => [o.value, o]));
  assert.ok(rows.submitHotkey, "V1-only submit key row must remain");
});

test("V1 engine remove asks to confirm, cancel returns", async () => {
  const m = mockApi();
  await plugin.tui(m.api, {});
  await cmd(m.layers, "voice.settings").run();
  await last(m.selects).onSelect({ value: "system" });
  await last(m.selects).onSelect({ value: "engine" });
  const remove = last(m.selects).options.find((o) => o.value === "remove");
  if (remove.disabled) {
    assert.equal(m.confirms.length, 0);
    return;
  }
  await last(m.selects).onSelect({ value: "remove" });
  assert.equal(last(m.confirms).title, "Remove managed engine?");
  await last(m.confirms).onCancel();
  assert.equal(last(m.selects).title, "Native engine");
});

// ---- E. startup picker ----

test("V1 startup picker shows on fresh installs only", async (t) => {
  mock.timers.enable({ apis: ["setTimeout"] });
  t.after(() => mock.timers.reset());
  const fresh = mockApi();
  await plugin.tui(fresh.api, {});
  mock.timers.tick(250);
  assert.ok(
    fresh.selects.some((s) => s.title === "Set up voice input: choose a local model"),
    JSON.stringify(fresh.selects.map((s) => s.title)),
  );

  const done = mockApi({ "voice.onboardingDone": true, "voice.setupSkipped": true });
  await plugin.tui(done.api, {});
  mock.timers.tick(250);
  assert.ok(!done.selects.some((s) => s.title === "Set up voice input: choose a local model"));
});
