import type { MotionTier, CreativeIntent, WhiteBalance } from "./types";

export const STANDARD_APERTURES = [1.4, 1.8, 2.0, 2.8, 4.0, 5.6, 8.0, 11.0, 16.0, 22.0];

export const STANDARD_SHUTTERS = [
  1 / 8000, 1 / 4000, 1 / 2000, 1 / 1000, 1 / 500, 1 / 250, 1 / 125, 1 / 60,
  1 / 30, 1 / 15, 1 / 8, 1 / 4, 1 / 2, 1, 2, 4, 8, 15, 30,
];

export const STANDARD_ISOS = [100, 200, 400, 800, 1600, 3200, 6400, 12800];

// The lower four tiers were each one stop faster than the motion they
// describe actually requires (walking pace does not need 1/250), which
// forced ISO up with no sharpness benefit. very_fast is deliberately left
// at 1/2000 and the 2-stop gap to `fast` is intentional: birds in flight
// and motorsport genuinely need it, and those scenes are almost always
// bright enough that the floor costs no ISO.
export const MOTION_FLOORS: Record<MotionTier, number> = {
  stationary: 1 / 60,
  slow: 1 / 125,
  moderate: 1 / 250,
  fast: 1 / 500,
  very_fast: 1 / 2000,
};

export const DEFAULT_APERTURE: Record<CreativeIntent, number> = {
  shallow_dof: 2.0,
  deep_dof: 8.0,
  standard: 5.6,
};

export const WB_COLOR_TEMP: Record<WhiteBalance, number | null> = {
  daylight: 5500,
  cloudy: 6500,
  shade: 7500,
  tungsten: 3000,
  fluorescent: 4000,
  flash: 5500,
  auto: null,
};

export const ISO_MIN = 100;
export const ISO_MAX = 12800;
export const TRIPOD_LONG_EXPOSURE_LIMIT_S = 30;

// The camera's physical flash-sync ceiling, never emitted as a shutter value
// itself — see FLASH_SYNC_SAFE_SHUTTER_S for the grid value actually used.
export const FLASH_SYNC_SHUTTER_S = 1 / 200;

// 1/200 (FLASH_SYNC_SHUTTER_S) is not a member of STANDARD_SHUTTERS
// (STANDARD_SHUTTERS.indexOf(1/200) === -1), so it can never be used in the
// grid index arithmetic this file relies on. 1/125 is the slowest grid value
// whose duration is >= FLASH_SYNC_SHUTTER_S, i.e. the fastest grid shutter
// that is actually flash-safe.
export const FLASH_SYNC_SAFE_SHUTTER_S = 1 / 125;

if (
  !STANDARD_SHUTTERS.includes(FLASH_SYNC_SAFE_SHUTTER_S) ||
  FLASH_SYNC_SAFE_SHUTTER_S < FLASH_SYNC_SHUTTER_S
) {
  throw new Error(
    "FLASH_SYNC_SAFE_SHUTTER_S must be a member of STANDARD_SHUTTERS with a duration >= FLASH_SYNC_SHUTTER_S"
  );
}

// Flash supplies the key light, so riding ambient ISO only adds noise to a
// background the flash does not need lit. Deliberately one stop below
// ISO_SOFT_CAP.
export const FLASH_AMBIENT_ISO_CEILING = 800;

// Caps shutter drag on the ambient solve so a tripod + stationary flash scene
// cannot inherit TRIPOD_LONG_EXPOSURE_LIMIT_S (30s).
export const FLASH_MAX_AMBIENT_DRAG_S = 1;

// Above this, no ISO warning is pushed. Above 2x this (3200), a warning names
// the constraint that forced it. Tune here rather than scattering literals.
// Lowered from 3200: this is where the concession ladder starts trading
// aperture for ISO, so lowering it makes the solver reach for a wider
// aperture sooner rather than riding ISO.
export const ISO_SOFT_CAP = 1600;

// Ordinary (non-extreme-low-light) scenes stop here and warn of underexposure
// instead of silently riding ISO to ISO_MAX. Only scenes at or below
// EXTREME_LOW_LIGHT_EV_THRESHOLD may use the full ISO_MAX headroom.
export const ISO_ORDINARY_CAP = 6400;
export const EXTREME_LOW_LIGHT_EV_THRESHOLD = 1;

// f/1.8 is how far "standard" intent may widen when gear is unknown or the
// focal length was assumed. A lens confirmed to cover a user-stated focal
// length may widen past it — see widestAllowedAperture in calculate.ts. This
// limit is only ever reached when ISO would otherwise exceed ISO_SOFT_CAP.
export const STANDARD_INTENT_WIDE_LIMIT = 1.8;

// Global brightness nudge applied to the final ISO solve, in stops, before
// rounding to the standard ISO grid. Neutral (0) until a real-world
// calibration pass tunes it — see calculate.ts's exposure residual step.
export const EXPOSURE_BIAS_STOPS = 0;

// The 1/focal_length_mm shake rule assumes blur scales with angular
// magnification, but hand tremor has an absolute floor independent of focal
// length — nobody reliably holds 1/8s steady just because the lens is 8mm.
// This caps the shake floor so it never allows a slower shutter than 1/15,
// regardless of how wide the lens is. 1/15 (not the more common 1/30
// rule-of-thumb, and not a fresh non-grid value like 1/20) specifically
// because it's an actual STANDARD_SHUTTERS grid entry, and its duration
// (0.067s) is slower than 24mm's shake floor (1/24 = 0.042s) — so it doesn't
// bind there, preserving the 1-stop recovery (1/60 → nearest grid shutter
// 1/30) that fixing the stationary-motion-floor bug was meant to restore.
// 1/30's duration (0.033s) would have been FASTER than 1/24 and clamped it,
// silently undoing that fix.
// Only engages under ~15mm. Handheld only — tripod/stabilized don't use this.
export const HANDHELD_ABSOLUTE_SHUTTER_FLOOR_S = 1 / 15;

// Deep-DOF requests used to be pinned at f/8 with no escape, so a night
// landscape or astro shot paid the entire light deficit in ISO (ISO
// 12800 at f/8 where f/4 would have given 3200). Deep DOF may now widen
// this far, and no further, under ISO pressure — f/4 still holds usable
// front-to-back sharpness on most focal lengths.
export const DEEP_DOF_WIDE_LIMIT = 4.0;

// Panning tracks the subject with the camera: the subject stays sharp
// while the background streaks. The shutter is therefore set by the pan
// technique, not by the subject's motion tier. 1/60 is the classic
// starting point and is a STANDARD_SHUTTERS grid member.
export const PAN_SHUTTER_S = 1 / 60;
