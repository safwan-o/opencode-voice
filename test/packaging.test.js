import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const pkg = require("../package.json");

function exportTarget(subpath) {
  const entry = pkg.exports?.[subpath];
  assert.ok(entry?.import, `exports[${subpath}].import missing`);
  return entry.import;
}

test("exports map targets exist on disk", () => {
  for (const subpath of [".", "./tui", "./runtime"]) {
    const target = exportTarget(subpath);
    const fromRoot = target.replace(/^\.\//, "../");
    assert.ok(
      existsSync(new URL(fromRoot, import.meta.url)),
      `${subpath} -> ${target} missing`,
    );
  }
  assert.equal(pkg.main, exportTarget("."), "main and exports[.] diverged");
});

test("engines declare dual-version support", () => {
  assert.equal(pkg.engines?.node, ">=22");
  assert.equal(pkg.engines?.opencode, ">=1.17.4");
});

test("V1 peer stays optional", () => {
  assert.match(pkg.peerDependencies?.["@opencode-ai/plugin"] ?? "", /1\.17/);
  assert.equal(
    pkg.peerDependenciesMeta?.["@opencode-ai/plugin"]?.optional,
    true,
    "V1 peer must stay optional so V2 installs need nothing extra",
  );
});

test("V1 entry has the TuiPluginModule shape", async () => {
  const v1 = await import("../index.js");
  assert.equal(typeof v1.default?.tui, "function", "missing tui(api, options)");
  assert.equal(typeof v1.default?.id, "string", "missing plugin id");
  assert.ok(!("server" in v1.default), "V1 module must not define server");
});

test("V2 entry is a Plugin.define definition", async () => {
  const v2 = await import("../src/tui.ts");
  assert.equal(v2.default?.id, "opencode-voice");
  assert.equal(typeof v2.default?.setup, "function", "missing setup(context)");
});
