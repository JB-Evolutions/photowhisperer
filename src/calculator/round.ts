import type { ExposureSolution } from "../lib/contract/types";
import {
  CAMERA_APERTURE_STEPS,
  CAMERA_ISO_STEPS,
  CAMERA_SHUTTER_STEPS_S,
} from "./constants";

// Relative tolerance so a value already sitting on a step (5.6, 1/60, a
// floor of exactly 1/50) stays put despite float noise.
const EPSILON = 1e-9;

// Smallest step at or above value. Past the end of the scale the value is
// returned unchanged rather than rounded the unsafe way.
function stepAtOrAbove(steps: readonly number[], value: number): number {
  return steps.find((step) => step >= value * (1 - EPSILON)) ?? value;
}

// Largest step at or below value.
function stepAtOrBelow(steps: readonly number[], value: number): number {
  for (let i = steps.length - 1; i >= 0; i--) {
    if (steps[i] <= value * (1 + EPSILON)) return steps[i];
  }
  return value;
}

// Converts solveExposure's exact values into settings a camera can dial in.
// Presentation layer only — solveExposure stays unrounded. Every value rounds
// in its safe direction:
//   aperture — third stop NARROWER, so it's never wider than the lens allows
//   shutter  — standard step FASTER, so it's never slower than the floor
//   ISO      — third stop UP, then clamped DOWN to isoCeiling if it overshoots
// Aperture and shutter rounding lose light, ISO rounding gains it (and the
// clamp gives some back), so shortfallStops is recomputed to match what the
// user actually dials in.
//
// isoCeiling is a hard limit the ISO may never round past: pass body.isoMax
// for isoMode "capped" and body.isoValue for "locked" (so a locked ISO never
// moves); leave it undefined for "auto".
export function roundToCameraSteps(s: ExposureSolution, isoCeiling?: number): ExposureSolution {
  const aperture = s.aperture == null ? null : stepAtOrAbove(CAMERA_APERTURE_STEPS, s.aperture);
  const shutterS = stepAtOrBelow(CAMERA_SHUTTER_STEPS_S, s.shutterS);
  const roundedIso = stepAtOrAbove(CAMERA_ISO_STEPS, s.iso);
  const iso = isoCeiling == null ? roundedIso : Math.min(roundedIso, isoCeiling);

  // Exposure ∝ shutter × ISO / N². Positive = light lost by rounding. A null
  // aperture is the same notional f-number before and after, so costs 0.
  const apertureLoss =
    s.aperture == null || aperture == null ? 0 : 2 * Math.log2(aperture / s.aperture);
  const roundingLoss = apertureLoss + Math.log2(s.shutterS / shutterS) + Math.log2(s.iso / iso);
  const gap = s.shortfallStops + roundingLoss;

  return { ...s, aperture, shutterS, iso, shortfallStops: gap > EPSILON ? gap : 0 };
}
