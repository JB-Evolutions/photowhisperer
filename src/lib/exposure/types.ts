// Exposure types local to scene-EV resolution. Cross-window types (LightCondition,
// LIGHT_CONDITION_EV, ExposureSolution…) live in src/lib/contract/types.ts.

export type ExifExposure = {
  fNumber: number;
  exposureTimeS: number;
  iso: number;
  exposureBiasEv: number; // 0 when the tag is absent
};

export type SubjectExposureVerdict =
  | "subject_much_darker"
  | "subject_slightly_darker"
  | "metered_on_subject"
  | "subject_slightly_brighter"
  | "subject_much_brighter";

export type Histogram = {
  shadowClipPct: number; // 0-100
  highlightClipPct: number; // 0-100
};

export type EvResolution = {
  scene_ev: number | null; // null only at tier 3 — nothing to measure or estimate from
  tier: 1 | 2 | 3;
  source: "exif" | "scene_class" | "user_stated";
  assumption: string | null;
};

// exifr output parsed with EXIFR_OPTIONS (src/lib/image/exif.ts): translated
// keys, untranslated numeric values.
export type RawExif = Record<string, unknown>;
