import type { MotionTier, CreativeIntent, WhiteBalance } from "./types.js";

export const STANDARD_APERTURES = [1.4, 1.8, 2.0, 2.8, 4.0, 5.6, 8.0, 11.0, 16.0];

export const STANDARD_SHUTTERS = [
  1 / 8000, 1 / 4000, 1 / 2000, 1 / 1000, 1 / 500, 1 / 250, 1 / 125, 1 / 60,
  1 / 30, 1 / 15, 1 / 8, 1 / 4, 1 / 2, 1, 2, 4, 8, 15, 30,
];

export const STANDARD_ISOS = [100, 200, 400, 800, 1600, 3200, 6400, 12800];

export const MOTION_FLOORS: Record<MotionTier, number> = {
  stationary: 1 / 60,
  slow: 1 / 250,
  moderate: 1 / 500,
  fast: 1 / 1000,
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
export const FLASH_SYNC_SHUTTER_S = 1 / 200;
export const FLASH_DEFAULT_ISO = 200;
