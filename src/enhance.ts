import {
  buildFilterChain as build,
  ENHANCE_CUTOFF_MAX_HZ,
  ENHANCE_CUTOFF_MIN_HZ,
  ENHANCE_DEFAULT_CUTOFF_HZ,
  ENHANCE_LIMITER,
  ENHANCE_NORM,
  normalizeCutoffHz,
} from "../lib/enhance.js";

export {
  ENHANCE_CUTOFF_MAX_HZ,
  ENHANCE_CUTOFF_MIN_HZ,
  ENHANCE_DEFAULT_CUTOFF_HZ,
  normalizeCutoffHz,
};

// UI-facing descriptor (kept for compatibility with existing tests/callers).
export const ENHANCE = {
  highpassFreq: ENHANCE_DEFAULT_CUTOFF_HZ,
  declip: true,
  norm: ENHANCE_NORM,
  limiter: ENHANCE_LIMITER,
} as const;

export interface EnhanceInput {
  enabled: boolean;
  cutoffHz?: unknown;
}

export function buildFilterChain(input: EnhanceInput): string | null {
  return build({ enabled: input.enabled, cutoffHz: input.cutoffHz });
}
