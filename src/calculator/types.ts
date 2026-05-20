export type MotionTier = "stationary" | "slow" | "moderate" | "fast" | "very_fast";
export type Support = "handheld" | "tripod" | "stabilized";
export type CreativeIntent = "shallow_dof" | "deep_dof" | "standard";
export type WhiteBalance = "daylight" | "cloudy" | "shade" | "tungsten" | "fluorescent" | "flash" | "auto";

export interface SceneInput {
  scene_ev: number;
  motion_tier: MotionTier;
  support: Support;
  focal_length_mm: number;
  focal_length_assumed: boolean;
  creative_intent: CreativeIntent;
  white_balance: WhiteBalance;
  scene_summary?: string;
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
