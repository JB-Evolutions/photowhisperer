import { LIGHT_CONDITION_EV, type LightCondition } from "@/lib/contract/types";
import type {
  EvResolution,
  ExifExposure,
  Histogram,
  SubjectExposureVerdict,
} from "./types";

function assertPositiveFinite(name: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`evFromExif: ${name} must be a positive finite number, got ${value}`);
  }
}

// EV of the camera's settings, normalised to ISO 100.
export function evFromExif(e: ExifExposure): number {
  assertPositiveFinite("fNumber", e.fNumber);
  assertPositiveFinite("exposureTimeS", e.exposureTimeS);
  assertPositiveFinite("iso", e.iso);
  return Math.log2((e.fNumber * e.fNumber) / e.exposureTimeS) - Math.log2(e.iso / 100);
}

export const SUBJECT_OFFSET_STOPS: Record<SubjectExposureVerdict, number> = {
  subject_much_darker: -2,
  subject_slightly_darker: -1,
  metered_on_subject: 0,
  subject_slightly_brighter: 1,
  subject_much_brighter: 2,
};

// Interiors span EV 4-9 with no visual discriminator — the phone normalises them
// all to mid-grey — so a scene-class estimate is never trusted indoors.
export const INDOOR_CONDITIONS: ReadonlySet<LightCondition> = new Set<LightCondition>([
  "indoor_window",
  "indoor_artificial",
  "indoor_dim",
  "candlelit",
]);

export const HDR_ASSUMPTION =
  "Shot in HDR or Night mode — light level read from the photo's metadata only.";
export const SCENE_CLASS_ASSUMPTION =
  "Light level estimated from the scene, not measured — settings may be a stop off.";

const LARGE_OFFSET_STOPS = 1.5;
const MIN_SUPPORTING_CLIP_PCT = 1.0;

export type ResolveSceneEvInput = {
  exif: ExifExposure | null;
  verdict: SubjectExposureVerdict | null;
  histogram: Histogram | null;
  hdrSuspect: boolean;
  condition: LightCondition | null;
};

export function resolveSceneEv(input: ResolveSceneEvInput): EvResolution {
  const { exif, verdict, histogram, hdrSuspect, condition } = input;

  if (exif) {
    // Metered scene EV. A -1 bias means the camera deliberately gave one stop
    // less exposure than its meter asked for, so the settings EV sits one
    // stop above what the meter read: scene = settings + bias.
    if (!Number.isFinite(exif.exposureBiasEv)) {
      throw new RangeError(`resolveSceneEv: exposureBiasEv must be finite, got ${exif.exposureBiasEv}`);
    }
    const base = evFromExif(exif) + exif.exposureBiasEv;

    if (hdrSuspect) {
      return { scene_ev: base, tier: 1, source: "exif", assumption: HDR_ASSUMPTION };
    }

    let offset = verdict ? SUBJECT_OFFSET_STOPS[verdict] : 0;
    // A large correction must be backed by clipping on the matching side; with
    // no histogram there is nothing backing it, so it's discarded too.
    if (offset <= -LARGE_OFFSET_STOPS && !(histogram && histogram.shadowClipPct >= MIN_SUPPORTING_CLIP_PCT)) {
      offset = 0;
    }
    if (offset >= LARGE_OFFSET_STOPS && !(histogram && histogram.highlightClipPct >= MIN_SUPPORTING_CLIP_PCT)) {
      offset = 0;
    }

    return { scene_ev: base + offset, tier: 1, source: "exif", assumption: null };
  }

  if (condition !== null && !INDOOR_CONDITIONS.has(condition)) {
    return {
      scene_ev: LIGHT_CONDITION_EV[condition],
      tier: 2,
      source: "scene_class",
      assumption: SCENE_CLASS_ASSUMPTION,
    };
  }

  return { scene_ev: null, tier: 3, source: "user_stated", assumption: null };
}
