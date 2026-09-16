export type Confidence = "high" | "low" | "unknown";

export type LensProfile = {
  label: string;                  // raw user string, always kept
  focalMinMm: number | null;
  focalMaxMm: number | null;      // equals focalMinMm for primes
  aperWide: number | null;        // widest aperture at focalMinMm
  aperTele: number | null;        // widest aperture at focalMaxMm
  stabilised: boolean | null;     // null = unknown, never coerce to false
  stabStops: number | null;
  confidence: Confidence;
};

export type BodyProfile = {
  label: string;
  cropFactor: number | null;      // null = unknown, treat as 1.0 + assumption
  ibisStops: number | null;
  isoBase: number;                // default 100
  isoMode: "auto" | "locked" | "capped";
  isoValue: number | null;        // required when isoMode = "locked"
  isoMax: number | null;          // required when isoMode = "capped"
};

export type SubjectMotion = "static" | "slow" | "walking" | "fast";
export type Support = "handheld" | "tripod";

export type LightCondition =
  // Ambient: how bright the light falling on the scene is.
  | "snow_sand" | "direct_sun" | "hazy_sun" | "overcast"
  | "open_shade" | "golden_hour" | "blue_hour"
  | "night_street" | "night_no_street" | "night_moonlit"
  | "indoor_window" | "indoor_artificial" | "indoor_dim" | "candlelit"
  // Subject: how bright the thing being photographed is in its own right.
  // Reach for these when the subject is self-luminous or lit independently of
  // its surroundings — the ambient darkness around it is the wrong anchor and
  // reading it instead costs many stops (a moonlit field is 17 below the moon).
  | "moon_subject" | "fireworks" | "stage_lit" | "neon_signage";

export const LIGHT_CONDITION_EV: Record<LightCondition, number> = {
  snow_sand: 16, direct_sun: 15, hazy_sun: 14, overcast: 13,
  open_shade: 12, golden_hour: 11, blue_hour: 9,
  night_street: 8, night_no_street: 4, night_moonlit: -2,
  indoor_window: 8, indoor_artificial: 7, indoor_dim: 5, candlelit: 4,
  moon_subject: 15, fireworks: 10, stage_lit: 11, neon_signage: 10,
};
// EV at ISO 100. This is the single source of truth for scene light.
// Tunable by editing this table alone — never restate these values in a prompt.

// Highest ISO a solution may be dialled to when the body states no limit of
// its own. Single source of truth for the ceiling — never restated in a prompt
// and never written as a literal at a call site; read effectiveIsoCeiling().
export const DEFAULT_ISO_CEILING = 6400;

// The ISO a solution may never round or ride past, for this body. What the
// user stated about their body always beats the default:
//   locked — the single ISO they pinned, so the solve never moves it at all
//   capped — the ISO they say the body stops at, whether that is above or
//            below the default (a body declared good to 12800 gets 12800)
//   auto   — nothing stated, so DEFAULT_ISO_CEILING applies; a lower isoMax
//            carried on an auto profile still wins, since it is a real limit
export function effectiveIsoCeiling(body: BodyProfile): number {
  if (body.isoMode === "locked") return body.isoValue ?? body.isoBase;
  if (body.isoMode === "capped" && body.isoMax !== null) return body.isoMax;
  return Math.min(body.isoMax ?? Infinity, DEFAULT_ISO_CEILING);
}

export type BrightnessIntent = "moody" | "natural" | "bright";
export const INTENT_STOPS: Record<BrightnessIntent, number> = {
  moody: -1, natural: 0, bright: 1,
};

export type ShutterFloor = {
  floorS: number;
  setBy: "reciprocal" | "stabilised" | "subject_motion" | "tripod";
  explain: string;                // one user-facing line, always populated
};

export type ExposureSolution = {
  aperture: number | null;        // null = "widest your lens allows"
  shutterS: number;
  iso: number;
  shortfallStops: number;         // >0 = cannot reach target exposure
  floor: ShutterFloor;
  ladderTrace: string[];
};
