# Security posture

## Dependency audit cadence
Run `npm audit` monthly and on every `@opencode/plugin` upgrade.
Policy: fix high/critical promptly; moderate/low at convenience.
`npm install` is known-fragile in this repo (pre-existing `solid-js` peer pin
forces `--legacy-peer-deps`); review lockfile diffs before committing them.

## Assessed: CVE-2026-54285 (@opencode/plugin → @opentelemetry/core <2.8.0)
- ** vuln**: CWE-770, unbounded allocation in baggage `extract()` via oversized
  headers. CVSS 8.2 (v4) / 5.9 (v3.1). Fixed upstream in `@opentelemetry/core@2.8.0`.
- **Exposure here: none.** The vulnerable path requires attacker-controlled
  headers reaching an OpenTelemetry propagator. This package runs as a TUI
  extension: it receives no HTTP requests, defines no transports, and never
  calls propagator extract. No known exploit in the wild.
- **Decision (2026-09-17): no `overrides` pin.** Forcing core@2.8.0 under SDK
  2.6.1 packages risks host runtime breakage — worse than a non-exploitable
  finding.
- **Revisit triggers**: `@opencode/plugin` bumps its otel range; an exploit
  appears; or our code gains an inbound network surface. Re-run the audit then.
