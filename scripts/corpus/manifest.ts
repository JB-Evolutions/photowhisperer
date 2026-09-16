// Corpus manifest schema and the label vocabulary that validates against it.
//
// LIGHT_CONDITION_EV in src/lib/contract/types.ts is the single source of truth
// for which conditions exist and what EV each sits at. Nothing in scripts/corpus
// restates an EV number; every table here is keyed by the contract's own union,
// so adding a condition to the contract breaks compilation here until it is
// classified on both axes.
import { LIGHT_CONDITION_EV, type LightCondition } from "../../src/lib/contract/types";

// The contract names this type LightCondition. The corpus schema names the field
// `condition: LightConditionId`. This is an alias onto the imported union, not a
// redeclaration — the members live in the contract and only in the contract.
export type LightConditionId = LightCondition;

export type CorpusEntry = {
  id: string;                    // sha256(file bytes).slice(0,12)
  file: string;                  // path relative to corpus root
  capturedAt: string | null;     // ISO 8601, from EXIF DateTimeOriginal
  condition: LightConditionId;   // MUST be a key of LIGHT_CONDITION_EV
  indoor: boolean;
  subjectLit: boolean;           // true iff condition is on the subject-brightness axis
  groundTruth: {
    ev100: number;               // scene EV normalised to ISO 100
    source: "exif_manual" | "exif_auto_judged" | "meter";
    judgedOffStops: number;      // SIGNED. -1 = frame is 1 stop UNDERexposed. 0 = correct.
    confidence: "high" | "medium" | "low";
  };
  exif: {
    present: boolean;
    iso: number | null; apertureN: number | null; shutterSec: number | null;
    exposureBiasEv: number | null; meteringMode: string | null;
    make: string | null; model: string | null;
  };
  notes: string | null;
};

export type GroundTruthSource = CorpusEntry["groundTruth"]["source"];
export type GroundTruthConfidence = CorpusEntry["groundTruth"]["confidence"];
export type CorpusExif = CorpusEntry["exif"];

// What ingest writes and a human edits. It is a CorpusEntry with the
// human-owned fields still empty: condition/indoor/subjectLit are unset and
// ev100 is null until the exposure is derivable or metered. `validate` is the
// gate that proves a draft has become a CorpusEntry.
export type CorpusDraftEntry = {
  id: string;
  file: string;
  capturedAt: string | null;
  condition: LightConditionId | null;
  indoor: boolean | null;
  subjectLit: boolean | null;
  groundTruth: {
    ev100: number | null;
    source: GroundTruthSource;
    judgedOffStops: number;
    confidence: GroundTruthConfidence;
  };
  exif: CorpusExif;
  notes: string | null;
};

// Entries whose aperture/shutter/ISO were not all readable, so no EV could be
// derived from the file. They need a meter reading on the shoot sheet.
export type NeedsLabel = {
  id: string;
  file: string;
  reason: "no_exposure_exif";
};

export type CorpusManifest = {
  version: 1;
  generatedAt: string;
  root: string;
  entries: CorpusDraftEntry[];
  needs_labels: NeedsLabel[];
};

export const MANIFEST_VERSION = 1 as const;

export const CONDITION_IDS: readonly LightConditionId[] =
  Object.keys(LIGHT_CONDITION_EV) as LightConditionId[];

export function isLightConditionId(value: unknown): value is LightConditionId {
  return typeof value === "string"
    && Object.prototype.hasOwnProperty.call(LIGHT_CONDITION_EV, value);
}

// Hard error, never a warning: an unrecognised condition means the label
// vocabulary and the EV table have diverged, and every EV derived from that
// label is meaningless.
export function assertLightConditionId(value: unknown, where: string): LightConditionId {
  if (!isLightConditionId(value)) {
    throw new Error(
      `${where}: ${JSON.stringify(value)} is not a key of LIGHT_CONDITION_EV. `
      + `Valid conditions: ${CONDITION_IDS.join(", ")}`,
    );
  }
  return value;
}

// Which axis a condition measures. "subject" conditions describe how bright the
// thing being photographed is in its own right; "ambient" ones describe the
// light falling on the scene. subjectLit must agree with this.
export type ConditionAxis = "subject" | "ambient";

export const CONDITION_AXIS: Record<LightConditionId, ConditionAxis> = {
  snow_sand: "ambient", direct_sun: "ambient", hazy_sun: "ambient", overcast: "ambient",
  open_shade: "ambient", golden_hour: "ambient", blue_hour: "ambient",
  night_street: "ambient", night_no_street: "ambient", night_moonlit: "ambient",
  indoor_window: "ambient", indoor_artificial: "ambient", indoor_dim: "ambient",
  candlelit: "ambient",
  moon_subject: "subject", fireworks: "subject", stage_lit: "subject",
  neon_signage: "subject",
};

// Where a condition can physically occur. "either" is used only where both
// readings are genuinely common — a stage is as often a festival field as a
// theatre, and neon is shot from inside a bar as often as from the street.
export type ConditionPlacement = "indoor" | "outdoor" | "either";

export const CONDITION_PLACEMENT: Record<LightConditionId, ConditionPlacement> = {
  snow_sand: "outdoor", direct_sun: "outdoor", hazy_sun: "outdoor", overcast: "outdoor",
  open_shade: "outdoor", golden_hour: "outdoor", blue_hour: "outdoor",
  night_street: "outdoor", night_no_street: "outdoor", night_moonlit: "outdoor",
  // candlelit tracks the app's own INDOOR_CONDITIONS grouping in
  // src/lib/exposure/ev.ts rather than the rarer outdoor-terrace case.
  indoor_window: "indoor", indoor_artificial: "indoor", indoor_dim: "indoor",
  candlelit: "indoor",
  moon_subject: "outdoor", fireworks: "outdoor",
  stage_lit: "either", neon_signage: "either",
};

export function isSubjectAxis(condition: LightConditionId): boolean {
  return CONDITION_AXIS[condition] === "subject";
}

export function referenceEv100(condition: LightConditionId): number {
  return LIGHT_CONDITION_EV[condition];
}
