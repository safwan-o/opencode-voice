# Voice cleanup — measurements (Phase 0)

## Candidate chain (final)
`highpass=f=120, adeclick, dynaudnorm=f=150:g=7, alimiter=limit=0.95`
(+ existing tail resample/mono; no extra pass)

## Decisions vs original plan
- **`arnndn` dropped**: Ubuntu's ffmpeg 7.1 builds the filter without the
  RNNoise backend (`Error initializing filters` even bare) and the managed
  static binary is unconfirmed. Revisit only with a runtime availability probe.
- **`afftdn` dropped**: spectral-subtraction targets broadband hiss/crackle;
  measured zero effect on tonal hum (`nr=20:nf=-50` changed nothing).
- **No `silenceremove`** (eats onsets), no mains-notch bank (fragile across
  50/60 Hz regions), no dual-pass `loudnorm` (wrong tool for live record).

## Fixture measurements (system ffmpeg 7.1, one-pole <300 Hz metric)

| file | rms in → out | lowRatio in → out |
|---|---|---|
| rumble (synthetic mains hum) | 1708 → 4916 | 0.867 → 0.587 |
| clean (synthetic voice) | 670 → 4561 | 0.430 → 0.379 |
| silence | 0 → 0 | 0 → 0 |

Note: the one-pole metric understates the audible effect (a 2-pole highpass
at 120 Hz leaves the 100–150 Hz band strong in the number while the
recognizer-relevant balance is fixed — see functional proof below).

## Functional proof (real user clip, moonshine-base-Q8_0)
- Raw: exit 0, **empty** stdout (the reported bug).
- Through chain: `Hello, can you hear me right now?`, exit 0.
- Clean edge-tts reference: unchanged correct output (no-regression bar for Phase 4).

## Recorder insertion points (recon, `lib/engine.js`)
- Filtering runs **pre-transcribe** inside `VoiceRuntime.transcribe()`, not at
  record time: `arecord` is listed first on Linux (and present on this machine),
  so a record-time `-af` would silently never fire for arecord captures.
  Pre-transcribe covers every recorder backend with one code path.
- `buildFilterChain({enabled, cutoffHz})` from `./enhance.js`; ffmpeg resolved
  per call (missing binary or filter error → fall back to the raw file, never fail).
- Filtered copy is `${audioFile}.${pid}.clean.wav`, always unlinked (timeout /
  error / exit paths). `settings.voiceEnhance !== false` defaults ON for V1
  callers; V2 store defaults live in `src/settings.ts`.

## Live verification (0.4.0-beta.0, maintainer machine, 2026-09-16/17)
Dictated fox-sentence protocol, real mic + room rumble:

| Step | Setup | Result |
|---|---|---|
| 1 control | whisper-small | correct |
| 2 fix | moonshine-base + cleanup ON | word-perfect |
| 3 toggle proof | cleanup OFF | degraded (`frocks`, garbled onset) as expected |
| 4a cutoff 80 Hz | moonshine-base | degraded (`quid round-fork`: rumble leaks) |
| 4b cutoff 120 Hz | moonshine-base | perfect (default confirmed) |
| 4c cutoff 180 Hz | moonshine-base | slight degrade (`problem` for `brown`: eats voice) |
| whisper-small-q5_1 | cleanup ON | good, minor swaps (`churned` for `jumps`) |
| qwen3-asr-0.6b | cleanup ON | flawless transcript, noticeably slower (10x params, CPU-only) |

## Known issue (carried, not blocking)
wl-copy posts a system "clipboard ready" notification and paste into the TUI
only works after interacting with it (likely compositor focus/timing, content
itself is fine). Under investigation for 0.4.1.
