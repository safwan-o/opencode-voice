// Voice-cleanup filter chain (canonical home; plain JS so lib/ stays .ts-free).
//
// Evidence-backed locked values (see docs/voice-cleanup.md):
// - highpass 120 Hz: real rumble clip went empty -> perfect transcript.
// - arnndn/afftdn deliberately absent: arnndn cannot init on Ubuntu ffmpeg
//   (no RNNoise backend); afftdn measured zero effect on tonal hum.

export const ENHANCE_DEFAULT_CUTOFF_HZ = 120;
export const ENHANCE_CUTOFF_MIN_HZ = 40;
export const ENHANCE_CUTOFF_MAX_HZ = 500;
export const ENHANCE_NORM = "dynaudnorm=f=150:g=7";
export const ENHANCE_LIMITER = "alimiter=limit=0.95";

/** Coerce to an integer in the voice-safe band, else the default. */
export function normalizeCutoffHz(value) {
  const n = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  if (typeof n !== "number" || !Number.isFinite(n) || n <= 0 || n > 1000) return ENHANCE_DEFAULT_CUTOFF_HZ;
  return Math.min(ENHANCE_CUTOFF_MAX_HZ, Math.max(ENHANCE_CUTOFF_MIN_HZ, Math.round(n)));
}

/**
 * Build the ffmpeg -af filtergraph value, or null when cleanup is off.
 * Pure: no I/O. Recorder-agnostic (filtering runs pre-transcribe, so one
 * path covers ffmpeg/arecord/sox captures); ffmpeg availability is checked
 * at the use site, which falls back to the raw file.
 */
export function buildFilterChain({ enabled, cutoffHz } = {}) {
  if (!enabled) return null;
  return [`highpass=f=${normalizeCutoffHz(cutoffHz)}`, "adeclick", ENHANCE_NORM, ENHANCE_LIMITER].join(",");
}
