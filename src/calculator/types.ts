export type MotionTier = "stationary" | "slow" | "moderate" | "fast" | "very_fast";
export type Support = "handheld" | "tripod" | "stabilized";
export type CreativeIntent = "shallow_dof" | "deep_dof" | "standard";
export type WhiteBalance = "daylight" | "cloudy" | "shade" | "tungsten" | "fluorescent" | "flash" | "auto";
export type MotionIntent = "freeze" | "blur" | "pan";

export interface SceneInput {
  scene_ev: number;
  motion_tier: MotionTier;
  support: Support;
  focal_length_mm: number;
  focal_length_assumed: boolean;
  creative_intent: CreativeIntent;
  motion_intent: MotionIntent;
  white_balance: WhiteBalance;
  // Deliberate deviation from meter-correct exposure, in stops.
  // Negative = darker than the meter wants (night reads as night, a
  // white subject stays white). Optional for backward compatibility
  // with older classifier responses; treated as 0 when absent.
  exposure_bias_stops?: number;
  // True when the frame contains small much-brighter elements (street
  // lamps, shop windows, bare bulbs) that will clip before the subject
  // is correctly exposed. Optional; treated as false when absent.
  highlight_risk?: boolean;
  scene_summary?: string;
  // Fields the classifier filled with a conservative default because the
  // user didn't specify them (subset of "motion_tier" | "support" |
  // "creative_intent" | "white_balance"). Optional/absent for backward
  // compatibility with older classifier responses.
  defaulted?: string[];
  // Widest aperture (smallest f-number) the user's kit can reach, derived
  // from camera_profile.lenses. null when gear is absent or unparseable —
  // callers must not assume unconstrained widening in that case, since
  // calculate.ts falls back to a conservative unknown-gear limit.
  max_aperture?: number | null;
}

export interface SettingsOutput {
  status: "ok";
  iso: number;
  aperture: string;
  shutter_speed: string;
  white_balance: WhiteBalance;
  color_temperature: string | null;
  assumptions: string[];
  warnings: string[];
  scene_summary?: string;
}
