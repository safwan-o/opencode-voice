# Phase4 smoke — real V2 TUI load (2026-09-14, opencode v2.0.1)

## Method
- Backed up `~/.config/opencode/cli.json`, pointed `plugins` at local path `/home/safwan/opencode-voice`.
- Ran `printf 'q' | timeout 20 script -qec "opencode --standalone --print-logs --log-level all" /dev/null` (pty, 20s).
- Restored `cli.json` to `["@hxnnxs/opencode-voice"]` afterwards.

## Result: PASS
- TUI boots and runs full 20s window (timeout exit 124 = still alive, no crash).
- pty frame header renders voice plugin context (`OpenCode voice plugin TUI`) — `setup()` executed.
- Zero occurrences of `Invalid V2 TUI plugin module` / `failed to load plugin` for the plugin.
- Only `failed ...` line is pre-existing benign `failed to load OpenCode provider config` (network, unrelated).
- Hermetic gate still green on `main`: `npm test` 15 pass, `node --check` all JS, V1 `[id,tui]` intact, V2 `[id,setup]`.

## Remaining (interactive, needs a human terminal)
- `ctrl+r` record toggle, `/voice-settings` navigation, model download — to verify in a live session.
- Publish/unpublish decision for npm (`@hxnnxs` upstream vs fork scope) — Phase5.
