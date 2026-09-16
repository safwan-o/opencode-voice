# Publishing

## npm name

The package publishes as `@safwan-o/opencode-voice`.

The unscoped npm name `opencode-voice` is already published by another author, so do not publish this project under the unscoped name.

Before publishing:

1. Confirm `package.json#name` is `@safwan-o/opencode-voice`.
2. Keep the OpenCode plugin id as `opencode-voice` unless you want users to see a different plugin id.
3. Confirm published install examples in all `README*.md` files use `@safwan-o/opencode-voice`.
4. Create the GitHub repository `safwan-o/opencode-voice` and push `main`.
5. Run the **Engine Release** GitHub Actions workflow first. It builds both `whisper-cli` and the Rust `opencode-voice-transcribe` sidecar for every platform, then publishes:

```txt
https://github.com/safwan-o/opencode-voice/releases/download/v0.1.0/registry.json
```

6. Confirm the registry contains assets for the target release platforms.
7. Run:

```bash
npm run check
npm pack --dry-run --json
npm publish --dry-run
```

## Release checklist

- Confirm `bin/opencode-voice.js` is executable in `npm pack --dry-run --json` (`mode: 493`).
- Confirm `opencode-voice engine install whisper.cpp` and `opencode-voice engine install transcribe-cpp` download and probe managed engines from the release registry.
- Confirm `opencode-voice doctor` reports both managed runtime probes.
- Confirm model downloads write `.sha256` verification markers.
- Tag the release after the GitHub Actions release check passes.

## Local publish notes (no OIDC here)

- Do **not** set `publishConfig.provenance` — local `npm publish` fails with
  `EUSAGE` without a GitHub OIDC provider. Publish plainly:
  `npm publish --access public`.
- The v2.0.1 TUI loader installs npm specs only and caches aggressively:
  after publishing, fully quit the TUI and reopen it twice (first boot
  fetches/installs, second boot runs the new code). Verify with no
  `Plugin failed` banner plus palette (`Voice: record`) and first-run picker.
