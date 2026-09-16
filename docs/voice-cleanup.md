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
