## What
One-line summary.

## Why
Link issue or describe the motivation.

## How verified
- [ ] `npm run check` green (typecheck, lint, format, tests)
- [ ] New behavior covered by tests (or gated with `t.skip("needs ...")` + reason)
- [ ] No blobs committed (`git status` clean of `*.wav/*.mp3`)
- [ ] Docs updated if user-visible (README English source; note translation lag)

## Live check (if TUI behavior changed)
- [ ] Pointed `cli.json` at this code, cold-restarted twice
- [ ] No `Plugin failed` banner; feature exercised end to end
