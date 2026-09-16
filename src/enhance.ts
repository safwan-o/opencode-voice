// Voice-cleanup filter chain (Phase 1: pure builder, no callers yet).
//
// Locked constants, evidence-backed (see docs/voice-cleanup.md):
// - highpass 120 Hz: real rumble clip went empty -> perfect transcript.
//   Lower leaves the 110 Hz band; higher eats low voices. Retune only on
//   a real clip that proves otherwise.
// - arnndn/afftdn deliberately absent: arnndn cannot init on Ubuntu ffmpeg
//   (no RNNoise backend); afftdn measured zero effect on tonal hum.

export const ENHANCE = {
  /** Rumble/hum removal; voice fundamentals live above this. */
  highpassFreq: 120,
  /** Mic pop/click removal before normalization. */
  declip: true,
  /** Single-pass dynamic normalization (dual-pass loudnorm is wrong for live record). */
  norm: "dynaudnorm=f=150:g=7",
  /** Safety ceiling so normalized peaks never clip. */
  limiter: "alimiter=limit=0.95",
} as const;

export interface EnhanceInput {
  /** settings.voiceEnhance */
  enabled: boolean;
  /** true when the selected recorder is ffmpeg-based (only path with -af support) */
  ffmpeg: boolean;
}

/**
 * Build the ffmpeg -af filtergraph value, or null when cleanup is off
 * or the recorder cannot run audio filters.
 */
export function buildFilterChain(input: EnhanceInput): string | null {
  if (!input.enabled || !input.ffmpeg) return null;
  const parts = [`highpass=f=${ENHANCE.highpassFreq}`];
  if (ENHANCE.declip) parts.push("adeclick");
  parts.push(ENHANCE.norm, ENHANCE.limiter);
  return parts.join(",");
}
