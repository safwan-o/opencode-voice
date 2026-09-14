# V1 -> V2 Port Plan

Upstream: `ihxnnxs/opencode-voice@v0.2.3` (V1: `{id, tui: async(api)}`).
Target: OpenCode V2 CLI plugin (`@opencode/plugin/tui`, `Plugin.define({id, setup})`).
Fork: `safwan-o/opencode-voice`. Baseline tag: `phase0-baseline`.

## Phase0 — Fork + baseline [IN PROGRESS]
- Fork, clone to `~/opencode-voice`, remotes `origin` + `upstream`, tag `phase0-baseline`.
- Done when: `git remote -v` shows both, PR merged.

## Phase1 — API inventory (subagent, free model)
- Map every V1 `api.*` use in `index.js` + `lib/*` to V2 `ctx.*`.
- Output: `docs/v2-inventory.md` table. No code changes.
- Free model: `groq/llama-3.1-8b-instant` (inventory) or `google/gemini-2.5-flash`.

## Phase2 — V2 scaffold (no behavior change)
- Branch `feat/phase2-v2-scaffold`. Add `src/tui.ts` with `Plugin.define`, keep `index.js` untouched.
- Update `package.json` exports `./tui`, dep `@opencode/plugin`.
- Done when: `node --check`, `npm test` pass, loads in V2 without `Invalid V2 TUI plugin module`.

## Phase3 — Incremental port (one PR per slice)
- 3a keymap/commands, 3b dialogs/toasts, 3c storage/settings migration, 3d engine wiring.
- Keep `lib/` as-is; only adapt call sites.

## Phase4 — Verify on V2
- `npx opencode-voice doctor`, `opencode plugin list`, TUI smoke (`ctrl+r`, model picker, settings).
- `opencode --print-logs --standalone` shows no TUI plugin error.

## Phase5 — Release PR
- Version bump, CHANGELOG, README V2 `cli.json` docs, PR `main` -> release.

## Git practices
- One branch per phase/slice: `feat/phaseN-*`, conventional commits, PR per phase with test log.
- `main` always green. Tags per phase.
