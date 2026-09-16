// Exposure evaluation harness for the tier-2 (no-EXIF) light estimate.
//
// Two modes, deliberately separate:
//
//   --ladder   Deterministic, CI-safe, no network and no API key. Feeds each
//              corpus entry's groundTruth.ev100 STRAIGHT into solveExposure()
//              across fixed gear profiles and asserts the recommended triple
//              is exposure-correct for that EV and that gear. The model is
//              bypassed entirely, so a failure here is a solver/rounding bug,
//              never model variance.
//
//   (default)  Calls the real classifier. Strips EXIF from the photo, runs the
//              production tier-2 path (spatial verdict + the model's selected
//              light condition + the histogram the prompt is given), and
//              compares the estimated EV against groundTruth.ev100. Costs
//              money and is non-deterministic; responses are cached.
//
// Usage:
//   tsx scripts/eval-exposure.ts --ladder [--manifest <path>]
//   tsx scripts/eval-exposure.ts [--manifest <path>] [--no-cache] [--stub-model]
//                                [--limit <n>] [--use-notes] [--out <dir>]
//
// Nothing here modifies src/. Where production behaviour looks wrong, the
// harness emits a finding and leaves it alone.
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import exifr from "exifr";
import sharp from "sharp";

// The corpus manifest's entry type is owned by scripts/corpus/ and is never
// redeclared here. Only CorpusEntry is imported; every other shape this file
// needs is taken from it by indexed access, so a rename inside that module
// cannot silently desync this one.
import type { CorpusEntry } from "./corpus/types";

import { callClassifier } from "../src/api/classifier";
import { buildClassifierPrompt } from "../src/api/classifierPrompt";
import type { ImageInput } from "../src/api/types";
import {
  CAMERA_APERTURE_STEPS,
  CAMERA_ISO_STEPS,
  CAMERA_SHUTTER_STEPS_S,
  UNKNOWN_LENS_NOTIONAL_APERTURE,
} from "../src/calculator/constants";
import { formatAperture, formatShutter } from "../src/calculator/format";
import { solveExposure } from "../src/calculator/ladder";
import { roundToCameraSteps } from "../src/calculator/round";
import {
  DEFAULT_ISO_CEILING,
  INTENT_STOPS,
  LIGHT_CONDITION_EV,
  effectiveIsoCeiling,
  type BodyProfile,
  type BrightnessIntent,
  type ExposureSolution,
  type LensProfile,
  type LightCondition,
  type SubjectMotion,
  type Support,
} from "../src/lib/contract/types";
import { INDOOR_CONDITIONS, SUBJECT_OFFSET_STOPS, resolveSceneEv } from "../src/lib/exposure/ev";
import { exifExposureFromRaw } from "../src/lib/exposure/exif";
import type { ExifExposure, Histogram, SubjectExposureVerdict } from "../src/lib/exposure/types";
import { EXIFR_OPTIONS } from "../src/lib/image/exif";
import { HISTOGRAM_SAMPLE_EVERY, computeHistogram } from "../src/lib/image/histogram";
import { JPEG_QUALITY, LONG_EDGE_PX } from "../src/lib/image/limits";
import { apertureAtFocal } from "../src/lib/lens/parse";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// ─── Thresholds and other tunables ────────────────────────────────────────────

// PRIMARY gate, on evAbsError only. Below PASS the surface is fit to ship;
// at or above BLOCK it is not. The band between the two is a warning: real
// enough to look at, not decisive enough to hold a release on.
export const EV_GATE_PASS_MEAN = 1.0;
export const EV_GATE_BLOCK_MEAN = 1.5;

// A stratum with fewer than this many entries is reported but never gated —
// one bad frame must not be able to fail CI on its own.
export const MIN_GATE_N = 3;

// Anything at or under this is float noise, not a disagreement between the
// two EV pipelines.
export const DISAGREEMENT_TOLERANCE_STOPS = 0.01;

// Float slack for the ladder's exposure identity, which is exact arithmetic.
const IDENTITY_TOLERANCE_STOPS = 1e-6;

// Of the three camera grids only ISO rounds in the light-GAINING direction.
// Its "third stop" steps are nominal, not exact — 250 → 320 is log2(1.28) =
// 0.356 stops — so the bound sits above a true third of a stop. Anything
// beyond this means the recommendation overexposes for a reason the solver
// has not accounted for.
export const MAX_ROUNDING_GAIN_STOPS = 0.4;

const EPSILON = 1e-9;

// The one place the ladder's own arithmetic is knowingly inexact. In the
// too-bright branch (src/calculator/ladder.ts, "stopped down to ...") the
// solver rounds the stopped-down aperture NARROWER to a tenth of an f-stop
// for display honesty and returns shortfallStops: 0 without folding in the
// light that rounding costs. The exact aperture it rounded from is therefore
// in (a - 0.1, a], which bounds the undeclared loss exactly. This is derived
// from the run, not a tolerance picked to make the sweep pass, and every run
// that uses it is reported as a LADDER_UNDECLARED_APERTURE_ROUNDING finding
// rather than quietly forgiven.
function apertureTenthBoundStops(solverAperture: number): number {
  const exactLowerBound = Math.max(solverAperture - 0.1, EPSILON);
  return 2 * Math.log2(solverAperture / exactLowerBound);
}


// ─── Gear fixtures swept by --ladder ──────────────────────────────────────────

export type GearFixtureId =
  | "no_profile"
  | "prime_f18_auto"
  | "zoom_f56_auto"
  | "zoom_f56_iso1600"
  | "zoom_f56_iso12800";

export type GearFixture = {
  id: GearFixtureId;
  label: string;
  body: BodyProfile;
  lens: LensProfile;
  focalMm: number;
};

// Mirrors orchestrate.ts's DEFAULT_BODY: nothing stated, so nothing assumed
// beyond the contract's own defaults.
const NO_PROFILE_BODY: BodyProfile = {
  label: "unknown",
  cropFactor: null,
  ibisStops: null,
  isoBase: 100,
  isoMode: "auto",
  isoValue: null,
  isoMax: null,
};

const UNKNOWN_LENS: LensProfile = {
  label: "unknown",
  focalMinMm: null,
  focalMaxMm: null,
  aperWide: null,
  aperTele: null,
  stabilised: null,
  stabStops: null,
  confidence: "unknown",
};

function knownBody(over: Partial<BodyProfile>): BodyProfile {
  return { ...NO_PROFILE_BODY, label: "known body", cropFactor: 1, ...over };
}

const PRIME_F18: LensProfile = {
  label: "50mm f/1.8",
  focalMinMm: 50,
  focalMaxMm: 50,
  aperWide: 1.8,
  aperTele: 1.8,
  stabilised: false,
  stabStops: null,
  confidence: "high",
};

const ZOOM_F56: LensProfile = {
  label: "24-105mm f/5.6",
  focalMinMm: 24,
  focalMaxMm: 105,
  aperWide: 5.6,
  aperTele: 5.6,
  stabilised: false,
  stabStops: null,
  confidence: "high",
};

// Every fixture solves at 50mm, handheld, static, so the shutter floor is
// 1/50s across all five. Aperture and the ISO ceiling are then the only
// variables, which is what makes a difference between (c), (d) and (e)
// attributable to the ceiling and nothing else.
export const LADDER_FOCAL_MM = 50;
export const LADDER_MOTION: SubjectMotion = "static";
export const LADDER_SUPPORT: Support = "handheld";
export const LADDER_INTENT: BrightnessIntent = "natural";

export const GEAR_FIXTURES: readonly GearFixture[] = [
  {
    id: "no_profile",
    label: "(a) no camera profile at all",
    body: NO_PROFILE_BODY,
    lens: UNKNOWN_LENS,
    focalMm: LADDER_FOCAL_MM,
  },
  {
    id: "prime_f18_auto",
    label: "(b) f/1.8 prime, auto ISO",
    body: knownBody({}),
    lens: PRIME_F18,
    focalMm: LADDER_FOCAL_MM,
  },
  {
    id: "zoom_f56_auto",
    label: "(c) f/5.6 zoom, auto ISO",
    body: knownBody({}),
    lens: ZOOM_F56,
    focalMm: LADDER_FOCAL_MM,
  },
  {
    id: "zoom_f56_iso1600",
    label: "(d) f/5.6 zoom, ISO capped at 1600",
    body: knownBody({ isoMode: "capped", isoMax: 1600 }),
    lens: ZOOM_F56,
    focalMm: LADDER_FOCAL_MM,
  },
  {
    // The whole point of (e): a body that states a ceiling ABOVE the default
    // must be given its own number. If this fixture ever reports 6400 on a
    // dark frame, DEFAULT_ISO_CEILING has leaked in somewhere it should not.
    id: "zoom_f56_iso12800",
    label: "(e) f/5.6 zoom, body declares isoMax 12800",
    body: knownBody({ isoMode: "capped", isoMax: 12800 }),
    lens: ZOOM_F56,
    focalMm: LADDER_FOCAL_MM,
  },
];

export function gearFixture(id: GearFixtureId): GearFixture {
  const found = GEAR_FIXTURES.find((f) => f.id === id);
  if (!found) throw new Error(`Unknown gear fixture: ${id}`);
  return found;
}

// The gear the reported (secondary) recAbsError is quoted for: no camera
// profile, which is what most requests actually arrive as.
export const HEADLINE_FIXTURE_ID: GearFixtureId = "no_profile";

// ─── Exposure arithmetic the harness owns ─────────────────────────────────────

export type Triple = { aperture: number | null; shutterS: number; iso: number };

// The scene EV at ISO 100 that this triple correctly exposes for. Derived
// here from first principles rather than imported, so it is an independent
// check on the solver rather than a restatement of it. A null aperture is
// scored at the same notional f-number the ladder solved it at.
export function settingsEv100(t: Triple): number {
  const n = t.aperture ?? UNKNOWN_LENS_NOTIONAL_APERTURE;
  return Math.log2((n * n) / t.shutterS) - Math.log2(t.iso / 100);
}

// SECONDARY metric. The shortfall subtraction is not optional: when the ISO
// ceiling binds on a night scene the recommendation is deliberately short and
// says so through shortfallStops. Scoring it without subtracting what it
// already declared turns correct, honest behaviour into a multi-stop
// "failure" and builds a case for undoing the ceiling.
export function recAbsError(
  deliveredEv: number,
  requiredEv: number,
  declaredShortfallStops: number
): number {
  return Math.max(0, Math.abs(deliveredEv - requiredEv) - declaredShortfallStops);
}

// Single place the ISO ceiling enters rounding. effectiveIsoCeiling(body) is
// the only source: never DEFAULT_ISO_CEILING, never Infinity, never a literal.
export function roundForFixture(
  raw: ExposureSolution,
  fixture: Pick<GearFixture, "body">
): ExposureSolution {
  return roundToCameraSteps(raw, effectiveIsoCeiling(fixture.body));
}

// ─── Mode 1: the ladder sweep ─────────────────────────────────────────────────

export type LadderRun = {
  entryId: string;
  fixtureId: GearFixtureId;
  condition: CorpusEntry["condition"];
  indoor: boolean;
  sceneEv: number;
  targetEv: number;
  isoCeiling: number;
  ceilingBound: boolean;
  raw: ExposureSolution;
  rounded: ExposureSolution;
  deliveredEv: number;
  // deliveredEv - targetEv. Positive = the triple is set for a brighter scene
  // than the one in front of it, i.e. underexposed by that many stops.
  deliveredShortfallStops: number;
  recAbsError: number;
};

export function runLadder(entry: CorpusEntry, fixture: GearFixture): LadderRun {
  const sceneEv = entry.groundTruth.ev100;
  const raw = solveExposure({
    sceneEv,
    intent: LADDER_INTENT,
    focalMm: fixture.focalMm,
    body: fixture.body,
    lens: fixture.lens,
    motion: LADDER_MOTION,
    support: LADDER_SUPPORT,
  });
  const isoCeiling = effectiveIsoCeiling(fixture.body);
  const rounded = roundForFixture(raw, fixture);
  const targetEv = sceneEv - INTENT_STOPS[LADDER_INTENT];
  const deliveredEv = settingsEv100(rounded);

  return {
    entryId: entry.id,
    fixtureId: fixture.id,
    condition: entry.condition,
    indoor: entry.indoor,
    sceneEv,
    targetEv,
    isoCeiling,
    ceilingBound: raw.iso >= isoCeiling * (1 - EPSILON),
    raw,
    rounded,
    deliveredEv,
    deliveredShortfallStops: deliveredEv - targetEv,
    recAbsError: recAbsError(deliveredEv, targetEv, rounded.shortfallStops),
  };
}

// A run in which the ladder's stopped-down aperture was rounded narrower to a
// tenth of an f-stop without that light being counted as shortfall. Reported,
// never gated: it is bounded by apertureTenthBoundStops and is a fact about
// src/calculator/ladder.ts, not something this harness may fix.
export type LadderFinding = {
  kind: "LADDER_UNDECLARED_APERTURE_ROUNDING";
  entryId: string;
  fixtureId: GearFixtureId;
  solverAperture: number;
  lensWidestAperture: number;
  undeclaredStops: number;
  boundStops: number;
};

// The undeclared light the solver's own aperture rounding can account for on
// this run, and zero on every run that did not take that branch. Exposed so
// the identity check and the finding cannot drift apart.
//
// WORKAROUND for a known defect in src/calculator/ladder.ts, tracked here as
// LADDER_UNDECLARED_APERTURE_ROUNDING: narrowerTenth() rounds the stopped-down
// aperture narrower and still returns shortfallStops: 0. When ladder.ts is
// fixed to fold that light into shortfallStops, DELETE this function, the
// `slack` term in checkLadderRun and the LadderFinding type in the same commit
// — left in place they are a permanent blind spot of up to ~0.15 stops in the
// one assertion mode 1 exists to make.
function undeclaredApertureAllowance(run: LadderRun, fixture: GearFixture): number {
  const lensLimit = apertureAtFocal(fixture.lens, fixture.focalMm);
  if (run.raw.shortfallStops !== 0 || run.raw.aperture === null || lensLimit === null) return 0;
  if (run.raw.aperture <= lensLimit * (1 + EPSILON)) return 0;
  return apertureTenthBoundStops(run.raw.aperture);
}

export function ladderFinding(run: LadderRun, fixture: GearFixture): LadderFinding | null {
  const bound = undeclaredApertureAllowance(run, fixture);
  if (bound === 0) return null;
  const undeclared = run.deliveredShortfallStops - run.rounded.shortfallStops;
  if (undeclared <= IDENTITY_TOLERANCE_STOPS) return null;
  const lensLimit = apertureAtFocal(fixture.lens, fixture.focalMm);
  return {
    kind: "LADDER_UNDECLARED_APERTURE_ROUNDING",
    entryId: run.entryId,
    fixtureId: fixture.id,
    solverAperture: run.raw.aperture as number,
    lensWidestAperture: lensLimit as number,
    undeclaredStops: undeclared,
    boundStops: bound,
  };
}

function onGrid(steps: readonly number[], value: number): boolean {
  return steps.some((s) => Math.abs(s - value) <= Math.abs(value) * 1e-9);
}

// Every way the recommended triple can be wrong for the EV and gear it was
// solved from. Returns one string per violation; empty means correct.
export function checkLadderRun(run: LadderRun, fixture: GearFixture): string[] {
  const v: string[] = [];
  const { rounded, raw, isoCeiling } = run;
  const where = `${run.entryId} / ${fixture.id}`;

  if (rounded.aperture !== null && !onGrid(CAMERA_APERTURE_STEPS, rounded.aperture)) {
    v.push(`${where}: aperture ${rounded.aperture} is not a camera step`);
  }
  if (!onGrid(CAMERA_SHUTTER_STEPS_S, rounded.shutterS)) {
    v.push(`${where}: shutter ${rounded.shutterS}s is not a camera step`);
  }
  if (!onGrid(CAMERA_ISO_STEPS, rounded.iso)) {
    v.push(`${where}: ISO ${rounded.iso} is not a camera step`);
  }

  if (rounded.shutterS > raw.floor.floorS * (1 + EPSILON)) {
    v.push(
      `${where}: shutter ${formatShutter(rounded.shutterS)} is slower than the ${formatShutter(raw.floor.floorS)} floor`
    );
  }

  // The ceiling check is the assertion that makes effectiveIsoCeiling
  // load-bearing: a run that binds must land exactly on its own body's
  // ceiling, and a body that states something other than the default must
  // never be handed the default.
  if (rounded.iso > isoCeiling * (1 + EPSILON)) {
    v.push(`${where}: ISO ${rounded.iso} exceeds this body's ceiling of ${isoCeiling}`);
  }
  if (run.ceilingBound && rounded.iso !== isoCeiling) {
    v.push(`${where}: ceiling bound but ISO settled at ${rounded.iso}, not the ${isoCeiling} ceiling`);
  }
  if (run.ceilingBound && isoCeiling !== DEFAULT_ISO_CEILING && rounded.iso === DEFAULT_ISO_CEILING) {
    v.push(
      `${where}: ISO ${rounded.iso} is DEFAULT_ISO_CEILING, but this body states a ceiling of ${isoCeiling}`
    );
  }
  if (rounded.iso < fixture.body.isoBase) {
    v.push(`${where}: ISO ${rounded.iso} is below the body's base ISO of ${fixture.body.isoBase}`);
  }

  const lensLimit = apertureAtFocal(fixture.lens, fixture.focalMm);
  if (rounded.aperture !== null && lensLimit !== null && rounded.aperture < lensLimit * (1 - EPSILON)) {
    v.push(
      `${where}: aperture ${formatAperture(rounded.aperture)} is wider than the lens's ${formatAperture(lensLimit)}`
    );
  }

  if (!Number.isFinite(rounded.shortfallStops) || rounded.shortfallStops < 0) {
    v.push(`${where}: shortfallStops is ${rounded.shortfallStops}`);
  }

  // The identity the whole mode exists to assert: the triple either exposes
  // the scene correctly, or is short by exactly the amount it declares. The
  // only slack is the light the solver's own aperture-to-a-tenth rounding can
  // account for, which is bounded by the run itself and reported separately.
  const gap = run.deliveredShortfallStops;
  const slack = IDENTITY_TOLERANCE_STOPS + undeclaredApertureAllowance(run, fixture);
  if (rounded.shortfallStops > 0) {
    if (Math.abs(gap - rounded.shortfallStops) > slack) {
      v.push(
        `${where}: triple is ${gap.toFixed(3)} stops short but declares ${rounded.shortfallStops.toFixed(3)}`
      );
    }
  } else {
    if (gap > slack) {
      v.push(`${where}: triple is ${gap.toFixed(3)} stops underexposed but declares no shortfall`);
    }
    if (gap < -MAX_ROUNDING_GAIN_STOPS) {
      v.push(`${where}: triple overexposes by ${(-gap).toFixed(3)} stops, beyond camera-step rounding`);
    }
  }

  return v;
}

export type LadderReport = {
  runs: LadderRun[];
  violations: string[];
  findings: LadderFinding[];
};

export function runLadderSweep(entries: readonly CorpusEntry[]): LadderReport {
  const runs: LadderRun[] = [];
  const violations: string[] = [];
  const findings: LadderFinding[] = [];
  for (const entry of entries) {
    for (const fixture of GEAR_FIXTURES) {
      const run = runLadder(entry, fixture);
      runs.push(run);
      violations.push(...checkLadderRun(run, fixture));
      const finding = ladderFinding(run, fixture);
      if (finding) findings.push(finding);
    }
  }
  return { runs, violations, findings };
}

// ─── Statistics and stratification ────────────────────────────────────────────

export type Stats = {
  n: number;
  mean: number | null;
  median: number | null;
  p90: number | null;
  max: number | null;
};

export const EMPTY_STATS: Stats = { n: 0, mean: null, median: null, p90: null, max: null };

export function stats(values: readonly number[]): Stats {
  const n = values.length;
  if (n === 0) return EMPTY_STATS;
  const sorted = [...values].sort((a, b) => a - b);
  const mean = sorted.reduce((a, b) => a + b, 0) / n;
  const median =
    n % 2 === 1 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
  // Nearest-rank p90: the smallest value at or above which 90% of the sample
  // sits. On tiny strata this is simply the largest value, which is the
  // honest answer rather than an interpolated one.
  const p90 = sorted[Math.min(n - 1, Math.ceil(0.9 * n) - 1)];
  return { n, mean, median, p90, max: sorted[n - 1] };
}

export type ExclusionReason =
  | "FILE_MISSING"
  | "IMAGE_DECODE_FAILED"
  | "EXIF_NOT_STRIPPED"
  | "MODEL_ERROR"
  | "MODEL_INVALID_JSON"
  | "MODEL_INVALID_SCENE"
  | "MODEL_INVALID_INPUT"
  | "TIER_3_NO_ESTIMATE";

export type ScoredEntry = {
  entryId: string;
  condition: CorpusEntry["condition"];
  indoor: boolean;
  groundTruthEv: number;
  groundTruthConfidence: CorpusEntry["groundTruth"]["confidence"];
  estimatedEv: number;
  evAbsError: number;
  // recAbsError per gear fixture; HEADLINE_FIXTURE_ID is the one quoted in
  // the markdown, the rest are kept in the JSON.
  recAbsErrorByFixture: Record<string, number>;
  modelCondition: LightCondition | null;
  verdict: SubjectExposureVerdict | null;
  // How far the estimate would move if tier 2 applied the spatial verdict the
  // way tier 1 does. Reported, never applied — resolveSceneEv deliberately
  // ignores the verdict at tier 2.
  verdictOffsetIgnoredStops: number;
  histogram: Histogram;
  cached: boolean;
};

export type Excluded = {
  entryId: string;
  condition: CorpusEntry["condition"];
  indoor: boolean;
  reason: ExclusionReason;
  detail: string | null;
};

export type Stratum = {
  key: string;
  n: number;
  evAbsError: Stats;
  recAbsError: Stats;
  excluded: number;
  exclusionReasons: Record<string, number>;
};

export function buildStratum(
  key: string,
  scored: readonly ScoredEntry[],
  excluded: readonly Excluded[]
): Stratum {
  const reasons: Record<string, number> = {};
  for (const e of excluded) reasons[e.reason] = (reasons[e.reason] ?? 0) + 1;
  return {
    key,
    n: scored.length,
    evAbsError: stats(scored.map((s) => s.evAbsError)),
    recAbsError: stats(
      scored
        .map((s) => s.recAbsErrorByFixture[HEADLINE_FIXTURE_ID])
        .filter((x): x is number => typeof x === "number")
    ),
    excluded: excluded.length,
    exclusionReasons: reasons,
  };
}

function groupBy<T>(items: readonly T[], key: (t: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const bucket = out.get(k);
    if (bucket) bucket.push(item);
    else out.set(k, [item]);
  }
  return out;
}

export type Strata = {
  byCondition: Stratum[];
  byPlacement: Stratum[]; // "indoor" / "outdoor"
  overall: Stratum;
};

export function stratify(scored: readonly ScoredEntry[], excluded: readonly Excluded[]): Strata {
  const scoredByCondition = groupBy(scored, (s) => s.condition);
  const excludedByCondition = groupBy(excluded, (e) => e.condition);
  const conditions = new Set([...scoredByCondition.keys(), ...excludedByCondition.keys()]);

  const byCondition = [...conditions]
    .sort()
    .map((c) =>
      buildStratum(c, scoredByCondition.get(c) ?? [], excludedByCondition.get(c) ?? [])
    );

  const placement = (indoor: boolean) => (indoor ? "indoor" : "outdoor");
  const byPlacement = [false, true].map((indoor) =>
    buildStratum(
      placement(indoor),
      scored.filter((s) => s.indoor === indoor),
      excluded.filter((e) => e.indoor === indoor)
    )
  );

  return { byCondition, byPlacement, overall: buildStratum("all", scored, excluded) };
}

// ─── Gating ───────────────────────────────────────────────────────────────────

export type GateStatus = "pass" | "warn" | "block" | "insufficient_data";

export type Gate = {
  status: GateStatus;
  // Only these strata were allowed to influence the status.
  gatedStrata: string[];
  reasons: string[];
};

// CI gates on OUTDOOR strata only: that is the surface tier 2 ships on today.
// Indoor numbers are reported loudly and are deliberately unable to change
// this verdict — whether tier 2 should widen indoors is the open question the
// harness exists to answer, not a regression to enforce before it is decided.
export function gateOutdoor(scored: readonly ScoredEntry[], excluded: readonly Excluded[]): Gate {
  const outdoorScored = scored.filter((s) => !s.indoor);
  const outdoorExcluded = excluded.filter((e) => !e.indoor);
  const candidates: Stratum[] = [
    buildStratum("outdoor", outdoorScored, outdoorExcluded),
    ...stratify(outdoorScored, outdoorExcluded).byCondition,
  ];

  const gated = candidates.filter((s) => s.n >= MIN_GATE_N);
  if (gated.length === 0) {
    return {
      status: "insufficient_data",
      gatedStrata: [],
      reasons: [
        `No outdoor stratum reached the ${MIN_GATE_N}-entry minimum, so nothing was gated.`,
      ],
    };
  }

  const reasons: string[] = [];
  let status: GateStatus = "pass";
  for (const s of gated) {
    const mean = s.evAbsError.mean;
    if (mean === null) continue;
    if (mean >= EV_GATE_BLOCK_MEAN) {
      status = "block";
      reasons.push(
        `${s.key}: mean evAbsError ${mean.toFixed(2)} stops is at or above the ${EV_GATE_BLOCK_MEAN} block threshold (n=${s.n}).`
      );
    } else if (mean >= EV_GATE_PASS_MEAN) {
      if (status !== "block") status = "warn";
      reasons.push(
        `${s.key}: mean evAbsError ${mean.toFixed(2)} stops is in the ${EV_GATE_PASS_MEAN}-${EV_GATE_BLOCK_MEAN} warning band (n=${s.n}).`
      );
    }
  }
  if (reasons.length === 0) {
    reasons.push(
      `Every gated outdoor stratum is under ${EV_GATE_PASS_MEAN.toFixed(1)} stops mean evAbsError.`
    );
  }

  return { status, gatedStrata: gated.map((s) => s.key), reasons };
}

// ─── Provenance ───────────────────────────────────────────────────────────────

export const SYNTHETIC_CORPUS_CAVEAT =
  "SYNTHETIC CORPUS — agreement between the production EV path and the independent " +
  "derivation reflects fixture authorship, not validation. EV_PIPELINE_DISAGREEMENT " +
  "and indoor table-ceiling numbers are not evidence until run against real frames " +
  "with human-judged ground truth.";

export type Provenance = {
  synthetic: boolean;
  reasons: string[];
  caveat: string | null;
};

// Where the synthetic fixtures live. A manifest resolving inside this folder is
// authored, not measured, whatever its entries claim.
const FIXTURE_DIR = path.join(REPO_ROOT, "tests", "eval", "fixtures");

// Whether the numbers in this report describe a corpus someone wrote or a
// corpus someone measured. The cross-check and the indoor table ceiling are
// the two outputs that read as evidence and are not evidence on fixtures: the
// EXIF and the ground truth were authored together, so of course they agree.
// Cheap to state here, expensive to retrofit once a number has been quoted.
export function provenance(
  manifestPath: string,
  entries: readonly CorpusEntry[]
): Provenance {
  const reasons: string[] = [];

  const resolved = path.resolve(manifestPath);
  if (resolved === FIXTURE_DIR || resolved.startsWith(FIXTURE_DIR + path.sep)) {
    reasons.push("the manifest is the synthetic fixture set in tests/eval/fixtures/");
  }

  // A metered entry is the only ground truth taken independently of the frame's
  // own EXIF. With none, nothing here has been checked against the world.
  if (entries.length > 0 && !entries.some((e) => e.groundTruth.source === "meter")) {
    reasons.push("no entry has groundTruth.source \"meter\"");
  }

  const synthetic = reasons.length > 0;
  return { synthetic, reasons, caveat: synthetic ? SYNTHETIC_CORPUS_CAVEAT : null };
}

// ─── EV pipeline cross-check ──────────────────────────────────────────────────

export type PipelineFinding = {
  kind: "EV_PIPELINE_DISAGREEMENT";
  entryId: string;
  // scene_ev as the production path resolves it: evFromExif(exif) + bias.
  productionSceneEv: number;
  // Derived here, independently, from the frame's own taken settings.
  settingsEv100: number;
  differenceStops: number;
  exposureBiasEv: number;
  groundTruthEv: number;
  productionAbsError: number;
  settingsAbsError: number;
};

function exifExposureOf(entry: CorpusEntry): ExifExposure | null {
  const { present, iso, apertureN, shutterSec, exposureBiasEv } = entry.exif;
  if (!present || iso === null || apertureN === null || shutterSec === null) return null;
  if (!(iso > 0) || !(apertureN > 0) || !(shutterSec > 0)) return null;
  return {
    fNumber: apertureN,
    exposureTimeS: shutterSec,
    iso,
    exposureBiasEv: exposureBiasEv ?? 0,
  };
}

// Runs a frame's intact EXIF through the PRODUCTION path (resolveSceneEv,
// unmodified) and, separately, through settingsEv100 derived from the frame's
// own taken settings. The closed decision is scene_ev = evFromExif(exif) +
// exposureBiasEv; this reports whether that composes correctly against the
// settings the camera actually used. It never reconciles the two and never
// picks a winner — the disagreement is the output.
export function crossCheckEntry(entry: CorpusEntry): PipelineFinding | null {
  const exif = exifExposureOf(entry);
  if (!exif) return null;

  const resolution = resolveSceneEv({
    exif,
    verdict: null,
    histogram: null,
    hdrSuspect: false,
    condition: null,
  });
  if (resolution.scene_ev === null) return null;

  const derived =
    Math.log2((exif.fNumber * exif.fNumber) / exif.exposureTimeS) - Math.log2(exif.iso / 100);
  const difference = resolution.scene_ev - derived;
  if (Math.abs(difference) <= DISAGREEMENT_TOLERANCE_STOPS) return null;

  return {
    kind: "EV_PIPELINE_DISAGREEMENT",
    entryId: entry.id,
    productionSceneEv: resolution.scene_ev,
    settingsEv100: derived,
    differenceStops: difference,
    exposureBiasEv: exif.exposureBiasEv,
    groundTruthEv: entry.groundTruth.ev100,
    productionAbsError: Math.abs(resolution.scene_ev - entry.groundTruth.ev100),
    settingsAbsError: Math.abs(derived - entry.groundTruth.ev100),
  };
}

export function crossCheck(entries: readonly CorpusEntry[]): PipelineFinding[] {
  return entries.map(crossCheckEntry).filter((f): f is PipelineFinding => f !== null);
}

// ─── Indoor diagnostic ────────────────────────────────────────────────────────

export type IndoorTableRow = {
  entryId: string;
  condition: CorpusEntry["condition"];
  tableEv: number;
  groundTruthEv: number;
  absError: number;
};

// The best tier 2 could possibly do indoors if the classifier named the
// indoor class perfectly: LIGHT_CONDITION_EV vs. what was actually measured.
// This measures the TABLE, not the model, and is reported as such. It is the
// direct input to "should tier 2 widen to indoor scenes?".
export function indoorTableCeiling(entries: readonly CorpusEntry[]): {
  rows: IndoorTableRow[];
  stats: Stats;
} {
  const rows = entries
    .filter((e) => e.indoor)
    .map((e) => {
      const tableEv = LIGHT_CONDITION_EV[e.condition as LightCondition];
      return {
        entryId: e.id,
        condition: e.condition,
        tableEv,
        groundTruthEv: e.groundTruth.ev100,
        absError: Math.abs(tableEv - e.groundTruth.ev100),
      };
    })
    .filter((r) => Number.isFinite(r.tableEv));
  return { rows, stats: stats(rows.map((r) => r.absError)) };
}

// ─── Manifest loading ─────────────────────────────────────────────────────────

const VALID_CONDITIONS = new Set(Object.keys(LIGHT_CONDITION_EV));
const VALID_SOURCES = new Set(["exif_manual", "exif_auto_judged", "meter"]);
const VALID_CONFIDENCES = new Set(["high", "medium", "low"]);

function fail(where: string, message: string): never {
  throw new Error(`Manifest ${where}: ${message}`);
}

function str(v: unknown, where: string, field: string): string {
  if (typeof v !== "string" || v === "") fail(where, `${field} must be a non-empty string`);
  return v;
}

function nullableStr(v: unknown, where: string, field: string): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v !== "string") fail(where, `${field} must be a string or null`);
  return v;
}

function num(v: unknown, where: string, field: string): number {
  if (typeof v !== "number" || !Number.isFinite(v)) fail(where, `${field} must be a finite number`);
  return v;
}

function nullableNum(v: unknown, where: string, field: string): number | null {
  if (v === null || v === undefined) return null;
  return num(v, where, field);
}

function bool(v: unknown, where: string, field: string): boolean {
  if (typeof v !== "boolean") fail(where, `${field} must be a boolean`);
  return v;
}

function obj(v: unknown, where: string, field: string): Record<string, unknown> {
  if (typeof v !== "object" || v === null || Array.isArray(v)) fail(where, `${field} must be an object`);
  return v as Record<string, unknown>;
}

// Validates untyped JSON into CorpusEntry. The type itself is owned by
// scripts/corpus/ — this only proves a file on disk matches it.
export function parseManifest(raw: unknown): CorpusEntry[] {
  if (!Array.isArray(raw)) fail("root", "must be an array of entries");
  const seen = new Set<string>();

  return raw.map((item, i) => {
    const where = `entry ${i}`;
    const e = obj(item, where, "entry");
    const id = str(e.id, where, "id");
    if (seen.has(id)) fail(where, `duplicate id "${id}"`);
    seen.add(id);

    const condition = str(e.condition, `entry ${id}`, "condition");
    if (!VALID_CONDITIONS.has(condition)) {
      fail(`entry ${id}`, `condition "${condition}" is not a known light condition`);
    }

    const gt = obj(e.groundTruth, `entry ${id}`, "groundTruth");
    const source = str(gt.source, `entry ${id}`, "groundTruth.source");
    if (!VALID_SOURCES.has(source)) fail(`entry ${id}`, `groundTruth.source "${source}" is unknown`);
    const confidence = str(gt.confidence, `entry ${id}`, "groundTruth.confidence");
    if (!VALID_CONFIDENCES.has(confidence)) {
      fail(`entry ${id}`, `groundTruth.confidence "${confidence}" is unknown`);
    }

    const exif = obj(e.exif, `entry ${id}`, "exif");

    return {
      id,
      file: str(e.file, `entry ${id}`, "file"),
      capturedAt: nullableStr(e.capturedAt, `entry ${id}`, "capturedAt"),
      condition: condition as CorpusEntry["condition"],
      indoor: bool(e.indoor, `entry ${id}`, "indoor"),
      subjectLit: bool(e.subjectLit, `entry ${id}`, "subjectLit"),
      groundTruth: {
        ev100: num(gt.ev100, `entry ${id}`, "groundTruth.ev100"),
        source: source as CorpusEntry["groundTruth"]["source"],
        judgedOffStops: num(gt.judgedOffStops, `entry ${id}`, "groundTruth.judgedOffStops"),
        confidence: confidence as CorpusEntry["groundTruth"]["confidence"],
      },
      exif: {
        present: bool(exif.present, `entry ${id}`, "exif.present"),
        iso: nullableNum(exif.iso, `entry ${id}`, "exif.iso"),
        apertureN: nullableNum(exif.apertureN, `entry ${id}`, "exif.apertureN"),
        shutterSec: nullableNum(exif.shutterSec, `entry ${id}`, "exif.shutterSec"),
        exposureBiasEv: nullableNum(exif.exposureBiasEv, `entry ${id}`, "exif.exposureBiasEv"),
        meteringMode: nullableStr(exif.meteringMode, `entry ${id}`, "exif.meteringMode"),
        make: nullableStr(exif.make, `entry ${id}`, "exif.make"),
        model: nullableStr(exif.model, `entry ${id}`, "exif.model"),
      },
      notes: nullableStr(e.notes, `entry ${id}`, "notes"),
    };
  });
}

export async function loadManifest(manifestPath: string): Promise<CorpusEntry[]> {
  const text = await readFile(manifestPath, "utf8");
  return parseManifest(JSON.parse(text));
}

// ─── Image preparation (mode 2) ───────────────────────────────────────────────

export type PreparedEvalImage = {
  jpeg: Buffer;
  jpegBase64: string;
  histogram: Histogram;
  imageSha: string;
};

// Decodes, applies orientation, resizes to the same long edge the app uses and
// re-encodes as JPEG. sharp drops all metadata unless withMetadata() is called,
// which is exactly the stripping this mode needs — but it is verified rather
// than assumed, because surviving EXIF would silently turn a tier-2 measurement
// into a tier-1 one and the numbers would look far too good.
export async function prepareStripped(bytes: Buffer): Promise<PreparedEvalImage> {
  const jpeg = await sharp(bytes)
    .rotate()
    .resize({ width: LONG_EDGE_PX, height: LONG_EDGE_PX, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: Math.round(JPEG_QUALITY * 100) })
    .toBuffer();

  const parsed = await exifr.parse(jpeg, EXIFR_OPTIONS).catch(() => null);
  if (exifExposureFromRaw((parsed ?? null) as Record<string, unknown> | null) !== null) {
    throw new Error("EXIF_NOT_STRIPPED");
  }

  const { data } = await sharp(jpeg).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const histogram = computeHistogram(data, HISTOGRAM_SAMPLE_EVERY);

  return {
    jpeg,
    jpegBase64: jpeg.toString("base64"),
    histogram,
    imageSha: createHash("sha256").update(jpeg).digest("hex"),
  };
}

// A deterministic stand-in so the whole mode-2 pipeline can be exercised with
// zero real photos on disk. Flat colour derived from the entry id, which gives
// each fixture a different, reproducible histogram.
export async function syntheticJpeg(entryId: string): Promise<Buffer> {
  const h = createHash("sha256").update(entryId).digest();
  return sharp({
    create: { width: 640, height: 480, channels: 3, background: { r: h[0], g: h[1], b: h[2] } },
  })
    .jpeg({ quality: Math.round(JPEG_QUALITY * 100) })
    .toBuffer();
}

// ─── Model call and cache ─────────────────────────────────────────────────────

// Mirrors the default in src/api/classifier.ts, which does not export it. If
// that default moves, the cache key moves with it via ANTHROPIC_MODEL or this
// line, and stale entries are simply missed rather than silently reused.
const DEFAULT_MODEL = "claude-sonnet-4-6";

export function modelId(): string {
  return process.env.ANTHROPIC_MODEL ?? DEFAULT_MODEL;
}

export const CACHE_DIR = ".corpus-cache";

export function cacheKey(
  imageSha: string,
  prompt: string,
  userText: string,
  model: string
): { imageSha: string; promptSha: string } {
  const promptSha = createHash("sha256")
    .update(prompt)
    .update("\n--\n")
    .update(userText)
    .update("\n--\n")
    .update(model)
    .digest("hex");
  return { imageSha, promptSha };
}

type CacheRecord = {
  model: string;
  imageSha: string;
  promptSha: string;
  response: string;
  createdAt: string;
};

async function readCache(dir: string, imageSha: string, promptSha: string): Promise<string | null> {
  try {
    const text = await readFile(path.join(dir, `${imageSha}-${promptSha}.json`), "utf8");
    const record = JSON.parse(text) as CacheRecord;
    return typeof record.response === "string" ? record.response : null;
  } catch {
    return null;
  }
}

async function writeCache(dir: string, record: CacheRecord): Promise<void> {
  await mkdir(dir, { recursive: true });
  await writeFile(
    path.join(dir, `${record.imageSha}-${record.promptSha}.json`),
    `${JSON.stringify(record, null, 2)}\n`,
    "utf8"
  );
}

// The subset of the classifier's ok response this harness reads. Deliberately
// re-validated here rather than trusted: orchestrate.ts's own validator is not
// exported, and a malformed field must become an exclusion with a reason, not
// a silent default that quietly improves the score.
export type EvalScene = {
  motion: SubjectMotion;
  support: Support;
  focalMm: number | null;
  verdict: SubjectExposureVerdict | null;
  condition: LightCondition | null;
};

const MOTIONS: readonly SubjectMotion[] = ["static", "slow", "walking", "fast"];
const SUPPORTS: readonly Support[] = ["handheld", "tripod"];
const VERDICTS = Object.keys(SUBJECT_OFFSET_STOPS) as readonly SubjectExposureVerdict[];
const CONDITIONS = Object.keys(LIGHT_CONDITION_EV) as readonly LightCondition[];

export type ParsedScene = { scene: EvalScene } | { error: ExclusionReason; detail: string };

export function parseScene(raw: string): ParsedScene {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { error: "MODEL_INVALID_JSON", detail: raw.slice(0, 200) };
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { error: "MODEL_INVALID_SCENE", detail: "response is not an object" };
  }
  const o = parsed as Record<string, unknown>;
  if (o.status === "invalid_input") {
    return { error: "MODEL_INVALID_INPUT", detail: String(o.message ?? "") };
  }
  if (o.status !== "ok") {
    return { error: "MODEL_INVALID_SCENE", detail: `status was ${String(o.status)}` };
  }
  if (!MOTIONS.includes(o.motion as SubjectMotion)) {
    return { error: "MODEL_INVALID_SCENE", detail: `motion was ${String(o.motion)}` };
  }
  if (!SUPPORTS.includes(o.support as Support)) {
    return { error: "MODEL_INVALID_SCENE", detail: `support was ${String(o.support)}` };
  }
  const focal = o.focal_length_mm;
  if (
    focal !== null &&
    focal !== undefined &&
    (typeof focal !== "number" || !Number.isFinite(focal) || focal <= 0)
  ) {
    return { error: "MODEL_INVALID_SCENE", detail: `focal_length_mm was ${String(focal)}` };
  }
  const verdict = o.subject_exposure_verdict;
  if (verdict != null && !VERDICTS.includes(verdict as SubjectExposureVerdict)) {
    return { error: "MODEL_INVALID_SCENE", detail: `subject_exposure_verdict was ${String(verdict)}` };
  }
  const condition = o.condition;
  if (condition != null && !CONDITIONS.includes(condition as LightCondition)) {
    return { error: "MODEL_INVALID_SCENE", detail: `condition was ${String(condition)}` };
  }

  return {
    scene: {
      motion: o.motion as SubjectMotion,
      support: o.support as Support,
      focalMm: typeof focal === "number" ? focal : null,
      verdict: verdict != null ? (verdict as SubjectExposureVerdict) : null,
      condition: condition != null ? (condition as LightCondition) : null,
    },
  };
}

// The classifier's ok response for an entry, with the light condition nulled
// exactly where the production prompt tells the model to null it (an indoor
// AMBIENT scene). Deterministic, offline, and never confused with a real
// measurement: every report it feeds is marked stub.
export function stubClassifierResponse(entry: CorpusEntry): string {
  const condition = entry.condition as LightCondition;
  return JSON.stringify({
    status: "ok",
    motion: "static",
    support: "handheld",
    focal_length_mm: LADDER_FOCAL_MM,
    white_balance: "auto",
    lighting_direction: "unknown",
    highlight_risk: false,
    defaulted: ["motion", "support", "white_balance"],
    scene_summary: `stubbed scene for ${entry.id}`,
    subject_exposure_verdict: "metered_on_subject",
    condition: INDOOR_CONDITIONS.has(condition) ? null : condition,
  });
}

// ─── Mode 2: the model run ────────────────────────────────────────────────────

function clampFocal(lens: LensProfile, focalMm: number): number {
  if (lens.focalMinMm === null || lens.focalMaxMm === null) return focalMm;
  return Math.min(Math.max(focalMm, lens.focalMinMm), lens.focalMaxMm);
}

export function scoreRecommendations(
  estimatedEv: number,
  groundTruthEv: number,
  scene: EvalScene
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const fixture of GEAR_FIXTURES) {
    const focalMm = clampFocal(fixture.lens, scene.focalMm ?? fixture.focalMm);
    const raw = solveExposure({
      sceneEv: estimatedEv,
      intent: LADDER_INTENT,
      focalMm,
      body: fixture.body,
      lens: fixture.lens,
      motion: scene.motion,
      support: scene.support,
    });
    const rounded = roundForFixture(raw, fixture);
    out[fixture.id] = recAbsError(settingsEv100(rounded), groundTruthEv, rounded.shortfallStops);
  }
  return out;
}

export type ModelRunOptions = {
  manifestPath: string;
  useCache: boolean;
  stub: boolean;
  useNotes: boolean;
  limit: number | null;
};

export type ModelReport = {
  mode: "model";
  generatedAt: string;
  manifest: string;
  provenance: Provenance;
  model: string;
  stub: boolean;
  cache: { hits: number; misses: number; enabled: boolean };
  totals: { entries: number; scored: number; excluded: number };
  gate: Gate;
  strata: Strata;
  indoorTableCeiling: { rows: IndoorTableRow[]; stats: Stats };
  verdictIgnoredStops: Stats;
  findings: PipelineFinding[];
  scored: ScoredEntry[];
  excluded: Excluded[];
};

export async function runModelMode(options: ModelRunOptions): Promise<ModelReport> {
  const all = await loadManifest(options.manifestPath);
  const entries = options.limit === null ? all : all.slice(0, options.limit);
  const manifestDir = path.dirname(path.resolve(options.manifestPath));
  const model = modelId();
  const cacheDir = path.resolve(REPO_ROOT, CACHE_DIR);

  const scored: ScoredEntry[] = [];
  const excluded: Excluded[] = [];
  let hits = 0;
  let misses = 0;

  const exclude = (entry: CorpusEntry, reason: ExclusionReason, detail: string | null) => {
    excluded.push({
      entryId: entry.id,
      condition: entry.condition,
      indoor: entry.indoor,
      reason,
      detail,
    });
  };

  for (const entry of entries) {
    let bytes: Buffer;
    try {
      bytes = await readFile(path.resolve(manifestDir, entry.file));
    } catch {
      if (!options.stub) {
        exclude(entry, "FILE_MISSING", entry.file);
        continue;
      }
      bytes = await syntheticJpeg(entry.id);
    }

    let prepared: PreparedEvalImage;
    try {
      prepared = await prepareStripped(bytes);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      exclude(
        entry,
        message === "EXIF_NOT_STRIPPED" ? "EXIF_NOT_STRIPPED" : "IMAGE_DECODE_FAILED",
        message
      );
      continue;
    }

    // Notes are withheld by default: they describe the scene's light in words
    // and would hand the model the answer this mode exists to measure.
    const userText = options.useNotes ? (entry.notes ?? "") : "";
    const image: ImageInput = {
      jpegBase64: prepared.jpegBase64,
      exif: null,
      rawExifFlags: { hdrSuspect: false },
      histogram: prepared.histogram,
    };
    const prompt = buildClassifierPrompt(null, image);
    const { imageSha, promptSha } = cacheKey(prepared.imageSha, prompt, userText, model);

    const fromCache = options.useCache ? await readCache(cacheDir, imageSha, promptSha) : null;
    const cached = fromCache !== null;
    let response: string;
    if (fromCache !== null) {
      hits++;
      response = fromCache;
    } else {
      misses++;
      try {
        response = options.stub
          ? stubClassifierResponse(entry)
          : await callClassifier(userText, null, image);
      } catch (err) {
        exclude(entry, "MODEL_ERROR", err instanceof Error ? err.message : String(err));
        continue;
      }
      await writeCache(cacheDir, {
        model: options.stub ? `${model} (stub)` : model,
        imageSha,
        promptSha,
        response,
        createdAt: new Date().toISOString(),
      });
    }

    const parsed = parseScene(response);
    if ("error" in parsed) {
      exclude(entry, parsed.error, parsed.detail);
      continue;
    }
    const scene = parsed.scene;

    // The production tier-2 path, unmodified: no EXIF, the model's own spatial
    // verdict and light condition, and the histogram the prompt was given.
    const resolution = resolveSceneEv({
      exif: null,
      verdict: scene.verdict,
      histogram: prepared.histogram,
      hdrSuspect: false,
      condition: scene.condition,
    });

    if (resolution.scene_ev === null) {
      // Tier 3. Indoors this is the production prompt working as designed — it
      // instructs the model to return null for an indoor ambient scene — so it
      // is a coverage fact, not a model error. Counted, never scored.
      exclude(
        entry,
        "TIER_3_NO_ESTIMATE",
        scene.condition === null
          ? "model returned condition null"
          : `condition ${scene.condition} is indoor ambient`
      );
      continue;
    }

    const estimatedEv = resolution.scene_ev;
    scored.push({
      entryId: entry.id,
      condition: entry.condition,
      indoor: entry.indoor,
      groundTruthEv: entry.groundTruth.ev100,
      groundTruthConfidence: entry.groundTruth.confidence,
      estimatedEv,
      evAbsError: Math.abs(estimatedEv - entry.groundTruth.ev100),
      recAbsErrorByFixture: scoreRecommendations(estimatedEv, entry.groundTruth.ev100, scene),
      modelCondition: scene.condition,
      verdict: scene.verdict,
      verdictOffsetIgnoredStops: scene.verdict ? SUBJECT_OFFSET_STOPS[scene.verdict] : 0,
      histogram: prepared.histogram,
      cached,
    });
  }

  return {
    mode: "model",
    generatedAt: new Date().toISOString(),
    manifest: path.relative(REPO_ROOT, path.resolve(options.manifestPath)),
    provenance: provenance(options.manifestPath, entries),
    model: options.stub ? `${model} (stub)` : model,
    stub: options.stub,
    cache: { hits, misses, enabled: options.useCache },
    totals: { entries: entries.length, scored: scored.length, excluded: excluded.length },
    gate: gateOutdoor(scored, excluded),
    strata: stratify(scored, excluded),
    indoorTableCeiling: indoorTableCeiling(entries),
    verdictIgnoredStops: stats(scored.map((s) => Math.abs(s.verdictOffsetIgnoredStops))),
    findings: crossCheck(entries),
    scored,
    excluded,
  };
}

// ─── Ladder report ────────────────────────────────────────────────────────────

export type LadderJsonReport = {
  mode: "ladder";
  generatedAt: string;
  manifest: string;
  entries: number;
  fixtures: { id: GearFixtureId; label: string; isoCeiling: number }[];
  runs: {
    entryId: string;
    fixtureId: GearFixtureId;
    condition: string;
    indoor: boolean;
    sceneEv: number;
    aperture: string;
    shutter: string;
    iso: number;
    isoCeiling: number;
    ceilingBound: boolean;
    declaredShortfallStops: number;
    deliveredShortfallStops: number;
    recAbsError: number;
  }[];
  violations: string[];
  findings: LadderFinding[];
};

export function ladderJson(
  manifestPath: string,
  entries: readonly CorpusEntry[],
  report: LadderReport
): LadderJsonReport {
  return {
    mode: "ladder",
    generatedAt: new Date().toISOString(),
    manifest: path.relative(REPO_ROOT, path.resolve(manifestPath)),
    entries: entries.length,
    fixtures: GEAR_FIXTURES.map((f) => ({
      id: f.id,
      label: f.label,
      isoCeiling: effectiveIsoCeiling(f.body),
    })),
    runs: report.runs.map((r) => ({
      entryId: r.entryId,
      fixtureId: r.fixtureId,
      condition: r.condition,
      indoor: r.indoor,
      sceneEv: r.sceneEv,
      aperture: r.rounded.aperture === null ? "widest" : formatAperture(r.rounded.aperture),
      shutter: formatShutter(r.rounded.shutterS),
      iso: r.rounded.iso,
      isoCeiling: r.isoCeiling,
      ceilingBound: r.ceilingBound,
      declaredShortfallStops: r.rounded.shortfallStops,
      deliveredShortfallStops: r.deliveredShortfallStops,
      recAbsError: r.recAbsError,
    })),
    violations: report.violations,
    findings: report.findings,
  };
}

// ─── Markdown ─────────────────────────────────────────────────────────────────

function n2(v: number | null): string {
  return v === null ? "—" : v.toFixed(2);
}

function reasonsCell(reasons: Record<string, number>): string {
  const parts = Object.entries(reasons).sort(([a], [b]) => a.localeCompare(b));
  return parts.length === 0 ? "—" : parts.map(([k, v]) => `${k} ×${v}`).join(", ");
}

function stratumRows(strata: readonly Stratum[]): string {
  return strata
    .map(
      (s) =>
        `| ${s.key} | ${s.n} | ${n2(s.evAbsError.mean)} | ${n2(s.evAbsError.median)} | ${n2(s.evAbsError.p90)} | ${n2(s.evAbsError.max)} | ${n2(s.recAbsError.mean)} | ${s.excluded} | ${reasonsCell(s.exclusionReasons)} |`
    )
    .join("\n");
}

const STRATUM_HEADER = [
  "| stratum | n | evAbsError mean | median | p90 | max | recAbsError mean | excluded | reasons |",
  "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |",
].join("\n");

export function renderLadderMarkdown(json: LadderJsonReport): string {
  const bound = json.runs.filter((r) => r.ceilingBound);
  const lines: string[] = [
    "# Exposure ladder sweep",
    "",
    `Generated ${json.generatedAt} from \`${json.manifest}\`.`,
    "",
    `${json.entries} entries × ${json.fixtures.length} gear fixtures = ${json.runs.length} solves. `,
    "Ground-truth EV is fed straight into `solveExposure()`; the model is not called.",
    "",
    "## Gear fixtures",
    "",
    "| id | fixture | effectiveIsoCeiling |",
    "| --- | --- | ---: |",
    ...json.fixtures.map((f) => `| \`${f.id}\` | ${f.label} | ${f.isoCeiling} |`),
    "",
    "## Result",
    "",
    json.violations.length === 0
      ? `**PASS** — every recommended triple is exposure-correct for its EV and gear, or short by exactly the amount it declares.`
      : `**FAIL** — ${json.violations.length} violation${json.violations.length === 1 ? "" : "s"}.`,
    "",
    `ISO ceiling bound on ${bound.length} of ${json.runs.length} solves.`,
    "",
  ];

  if (json.violations.length > 0) {
    lines.push("### Violations", "");
    for (const v of json.violations) lines.push(`- ${v}`);
    lines.push("");
  }

  // Reported, never gated. The ladder's too-bright branch rounds the
  // stopped-down aperture narrower to a tenth of a stop for display and
  // leaves shortfallStops at 0, so the triple is fractionally underexposed
  // without saying so. Bounded and small, but it is a finding about
  // src/calculator/ladder.ts, not something this harness resolves.
  if (json.findings.length > 0) {
    lines.push(
      "### Findings — undeclared aperture rounding",
      "",
      "`narrowerTenth()` in `src/calculator/ladder.ts` rounds a stopped-down aperture",
      "narrower for display and returns `shortfallStops: 0`. The light that costs is",
      "real but undeclared. Each row is within the bound that rounding can explain.",
      "",
      "| entry | fixture | lens widest | solver aperture | undeclared stops | bound |",
      "| --- | --- | ---: | ---: | ---: | ---: |",
      ...json.findings.map(
        (f) =>
          `| ${f.entryId} | \`${f.fixtureId}\` | ${formatAperture(f.lensWidestAperture)} | ${formatAperture(f.solverAperture)} | ${f.undeclaredStops.toFixed(3)} | ${f.boundStops.toFixed(3)} |`
      ),
      ""
    );
  }

  lines.push(
    "## Solves",
    "",
    "| entry | fixture | scene EV | aperture | shutter | ISO | ceiling | bound | declared short | delivered short | recAbsError |",
    "| --- | --- | ---: | --- | --- | ---: | ---: | :-: | ---: | ---: | ---: |",
    ...json.runs.map(
      (r) =>
        `| ${r.entryId} | ${r.fixtureId} | ${r.sceneEv} | ${r.aperture} | ${r.shutter} | ${r.iso} | ${r.isoCeiling} | ${r.ceilingBound ? "yes" : "no"} | ${r.declaredShortfallStops.toFixed(2)} | ${r.deliveredShortfallStops.toFixed(2)} | ${r.recAbsError.toFixed(2)} |`
    ),
    ""
  );

  return `${lines.join("\n")}\n`;
}

export function renderModelMarkdown(report: ModelReport): string {
  const { strata, gate } = report;
  const indoorStratum = strata.byPlacement.find((s) => s.key === "indoor");
  const outdoorStratum = strata.byPlacement.find((s) => s.key === "outdoor");
  const outdoorConditions = strata.byCondition.filter((s) =>
    report.scored.some((x) => x.condition === s.key && !x.indoor) ||
    report.excluded.some((x) => x.condition === s.key && !x.indoor)
  );
  const indoorConditions = strata.byCondition.filter((s) => !outdoorConditions.includes(s));

  const lines: string[] = [
    "# Tier-2 EV evaluation",
    "",
    `Generated ${report.generatedAt} from \`${report.manifest}\` with model \`${report.model}\`.`,
    report.provenance.caveat === null
      ? ""
      : `\n> **${report.provenance.caveat}**\n>\n> Triggered because ${report.provenance.reasons.join("; and ")}.`,
    report.stub
      ? "\n> **Stub run.** Responses came from the offline stub classifier, not the model. The numbers below exercise the harness; they measure nothing about the model."
      : "",
    "",
    `${report.totals.entries} entries: ${report.totals.scored} scored, ${report.totals.excluded} excluded. `,
    `Cache ${report.cache.enabled ? "on" : "off"} — ${report.cache.hits} hits, ${report.cache.misses} misses.`,
    "",
    "## Gate (outdoor only)",
    "",
    `**${gate.status.toUpperCase()}**`,
    "",
    ...gate.reasons.map((r) => `- ${r}`),
    "",
    `Gated strata: ${gate.gatedStrata.length === 0 ? "none" : gate.gatedStrata.map((s) => `\`${s}\``).join(", ")}. `,
    `A stratum needs n ≥ ${MIN_GATE_N} to gate. Indoor strata never gate, by design.`,
    "",
    "## Outdoor",
    "",
    STRATUM_HEADER,
    stratumRows([...(outdoorStratum ? [outdoorStratum] : []), ...outdoorConditions]),
    "",
    "## Indoor — reported, never gated",
    "",
    "Whether tier 2 should widen to indoor scenes is the open question this harness exists to answer.",
    "Nothing below can change the gate above.",
    "",
    STRATUM_HEADER,
    stratumRows([...(indoorStratum ? [indoorStratum] : []), ...indoorConditions]),
    "",
    "### Indoor ceiling if the classifier were perfect",
    "",
    report.provenance.caveat === null
      ? ""
      : "> **SYNTHETIC CORPUS.** The numbers in this section reflect fixture authorship, not\n> validation, and are not evidence until run against real frames with human-judged\n> ground truth. See the caveat at the top of this report.\n",
    "`LIGHT_CONDITION_EV[condition]` against measured ground truth, using each entry's own",
    "recorded condition. This measures the EV table, not the model: it is the best tier 2",
    "could do indoors even with a classifier that never misreads the scene.",
    "",
    `n=${report.indoorTableCeiling.stats.n}, mean ${n2(report.indoorTableCeiling.stats.mean)}, median ${n2(report.indoorTableCeiling.stats.median)}, p90 ${n2(report.indoorTableCeiling.stats.p90)}, max ${n2(report.indoorTableCeiling.stats.max)} stops.`,
    "",
    "| entry | condition | table EV | measured EV | abs error |",
    "| --- | --- | ---: | ---: | ---: |",
    ...report.indoorTableCeiling.rows.map(
      (r) => `| ${r.entryId} | ${r.condition} | ${r.tableEv} | ${r.groundTruthEv} | ${r.absError.toFixed(2)} |`
    ),
    "",
    "## All strata by condition",
    "",
    STRATUM_HEADER,
    stratumRows([strata.overall, ...strata.byPlacement, ...strata.byCondition]),
    "",
  ];

  lines.push(
    "## EV pipeline cross-check",
    "",
    report.provenance.caveat === null
      ? ""
      : "> **SYNTHETIC CORPUS.** The numbers in this section reflect fixture authorship, not\n> validation, and are not evidence until run against real frames with human-judged\n> ground truth. See the caveat at the top of this report.\n",
    `The closed decision is \`scene_ev = evFromExif(exif) + exposureBiasEv\`. Each entry with intact`,
    "EXIF is run through that production path and, independently, through",
    "`settingsEv100 = log2(N²/t) − log2(ISO/100)` derived from the frame's own taken settings.",
    "Disagreements are reported, not reconciled.",
    ""
  );
  if (report.findings.length === 0) {
    lines.push("No disagreements above the ±0.01 stop float tolerance.", "");
  } else {
    lines.push(
      `${report.findings.length} \`EV_PIPELINE_DISAGREEMENT\` finding${report.findings.length === 1 ? "" : "s"}:`,
      "",
      "| entry | production scene_ev | settingsEv100 | difference | exposure bias | measured EV | production err | settings err |",
      "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
      ...report.findings.map(
        (f) =>
          `| ${f.entryId} | ${f.productionSceneEv.toFixed(2)} | ${f.settingsEv100.toFixed(2)} | ${f.differenceStops >= 0 ? "+" : ""}${f.differenceStops.toFixed(2)} | ${f.exposureBiasEv >= 0 ? "+" : ""}${f.exposureBiasEv.toFixed(2)} | ${f.groundTruthEv.toFixed(2)} | ${f.productionAbsError.toFixed(2)} | ${f.settingsAbsError.toFixed(2)} |`
      ),
      ""
    );
  }

  lines.push(
    "## Spatial verdict at tier 2",
    "",
    "`resolveSceneEv` applies `SUBJECT_OFFSET_STOPS` at tier 1 only; at tier 2 the model's",
    "spatial verdict is collected and then discarded. This is how much the estimate would",
    "move if tier 2 applied it. Reported for information — the harness does not apply it.",
    "",
    `n=${report.verdictIgnoredStops.n}, mean ${n2(report.verdictIgnoredStops.mean)}, max ${n2(report.verdictIgnoredStops.max)} stops.`,
    "",
    "## Per-entry",
    "",
    "| entry | condition | in/out | measured EV | estimated EV | evAbsError | recAbsError (no profile) | model condition | verdict | gt confidence | cached |",
    "| --- | --- | --- | ---: | ---: | ---: | ---: | --- | --- | --- | :-: |",
    ...report.scored.map(
      (s) =>
        `| ${s.entryId} | ${s.condition} | ${s.indoor ? "indoor" : "outdoor"} | ${s.groundTruthEv.toFixed(2)} | ${s.estimatedEv.toFixed(2)} | ${s.evAbsError.toFixed(2)} | ${(s.recAbsErrorByFixture[HEADLINE_FIXTURE_ID] ?? 0).toFixed(2)} | ${s.modelCondition ?? "—"} | ${s.verdict ?? "—"} | ${s.groundTruthConfidence} | ${s.cached ? "yes" : "no"} |`
    ),
    ""
  );

  if (report.excluded.length > 0) {
    lines.push(
      "## Excluded",
      "",
      "| entry | condition | in/out | reason | detail |",
      "| --- | --- | --- | --- | --- |",
      ...report.excluded.map(
        (e) =>
          `| ${e.entryId} | ${e.condition} | ${e.indoor ? "indoor" : "outdoor"} | ${e.reason} | ${(e.detail ?? "").replace(/\|/g, "\\|").slice(0, 120)} |`
      ),
      ""
    );
  }

  return `${lines.join("\n")}\n`;
}

// ─── Output ───────────────────────────────────────────────────────────────────

export const OUT_DIR = "eval-out";

// Colons are legal on macOS but awkward everywhere else, so the ISO timestamp
// is flattened rather than reformatted.
export function timestampSlug(d: Date = new Date()): string {
  return d.toISOString().replace(/[:.]/g, "-").replace(/Z$/, "Z");
}

export async function writeReport(
  outDir: string,
  slug: string,
  json: unknown,
  markdown: string
): Promise<{ jsonPath: string; mdPath: string }> {
  await mkdir(outDir, { recursive: true });
  const jsonPath = path.join(outDir, `${slug}.json`);
  const mdPath = path.join(outDir, `${slug}.md`);
  await writeFile(jsonPath, `${JSON.stringify(json, null, 2)}\n`, "utf8");
  await writeFile(mdPath, markdown, "utf8");
  return { jsonPath, mdPath };
}

// ─── CLI ──────────────────────────────────────────────────────────────────────

// The corpus manifest is owned by scripts/corpus/; override with --manifest to
// run against the synthetic fixtures in tests/eval/fixtures/.
export const DEFAULT_MANIFEST = "scripts/corpus/manifest.json";

export type CliOptions = {
  ladder: boolean;
  manifestPath: string;
  outDir: string;
  useCache: boolean;
  stub: boolean;
  useNotes: boolean;
  limit: number | null;
};

export function parseArgs(argv: readonly string[]): CliOptions {
  const options: CliOptions = {
    ladder: false,
    manifestPath: DEFAULT_MANIFEST,
    outDir: OUT_DIR,
    useCache: true,
    stub: false,
    useNotes: false,
    limit: null,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--ladder":
        options.ladder = true;
        break;
      case "--no-cache":
        options.useCache = false;
        break;
      case "--stub-model":
        options.stub = true;
        break;
      case "--use-notes":
        options.useNotes = true;
        break;
      case "--manifest":
        options.manifestPath = argv[++i] ?? DEFAULT_MANIFEST;
        break;
      case "--out":
        options.outDir = argv[++i] ?? OUT_DIR;
        break;
      case "--limit": {
        const value = Number(argv[++i]);
        if (!Number.isInteger(value) || value <= 0) {
          throw new Error(`--limit needs a positive integer, got ${String(argv[i])}`);
        }
        options.limit = value;
        break;
      }
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const slug = timestampSlug();

  if (options.ladder) {
    const entries = await loadManifest(options.manifestPath);
    const report = runLadderSweep(entries);
    const json = ladderJson(options.manifestPath, entries, report);
    const { jsonPath, mdPath } = await writeReport(
      options.outDir,
      slug,
      json,
      renderLadderMarkdown(json)
    );
    for (const v of report.violations) console.error(`VIOLATION ${v}`);
    for (const f of report.findings) {
      console.error(
        `FINDING ${f.kind} ${f.entryId}/${f.fixtureId}: ${f.undeclaredStops.toFixed(3)} stops undeclared (bound ${f.boundStops.toFixed(3)})`
      );
    }
    console.log(
      `ladder: ${report.runs.length} solves across ${entries.length} entries, ${report.violations.length} violations, ${report.findings.length} findings`
    );
    console.log(`wrote ${jsonPath}`);
    console.log(`wrote ${mdPath}`);
    process.exitCode = report.violations.length === 0 ? 0 : 1;
    return;
  }

  // No key and no explicit --stub-model would mean every entry failing with an
  // auth error, which reads as a model result. Refuse instead.
  if (!options.stub && !process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Set it, or pass --stub-model to exercise the pipeline offline."
    );
  }

  const report = await runModelMode({
    manifestPath: options.manifestPath,
    useCache: options.useCache,
    stub: options.stub,
    useNotes: options.useNotes,
    limit: options.limit,
  });
  const { jsonPath, mdPath } = await writeReport(
    options.outDir,
    slug,
    report,
    renderModelMarkdown(report)
  );

  const outdoor = report.strata.byPlacement.find((s) => s.key === "outdoor");
  const indoor = report.strata.byPlacement.find((s) => s.key === "indoor");
  if (report.provenance.caveat !== null) console.error(report.provenance.caveat);
  console.log(`model: ${report.totals.scored} scored, ${report.totals.excluded} excluded`);
  console.log(
    `outdoor evAbsError: n=${outdoor?.n ?? 0} mean=${n2(outdoor?.evAbsError.mean ?? null)} p90=${n2(outdoor?.evAbsError.p90 ?? null)}`
  );
  console.log(
    `indoor  evAbsError: n=${indoor?.n ?? 0} mean=${n2(indoor?.evAbsError.mean ?? null)} p90=${n2(indoor?.evAbsError.p90 ?? null)}  (never gated)`
  );
  for (const f of report.findings) {
    console.log(
      `EV_PIPELINE_DISAGREEMENT ${f.entryId}: production scene_ev ${f.productionSceneEv.toFixed(2)} vs settingsEv100 ${f.settingsEv100.toFixed(2)} (${f.differenceStops >= 0 ? "+" : ""}${f.differenceStops.toFixed(2)} stops)`
    );
  }
  console.log(`gate (outdoor only): ${report.gate.status}`);
  for (const r of report.gate.reasons) console.log(`  ${r}`);
  console.log(`wrote ${jsonPath}`);
  console.log(`wrote ${mdPath}`);
  process.exitCode = report.gate.status === "block" ? 1 : 0;
}

// Only when run directly, so importing this module from a test never starts a
// sweep or a billable model run.
const invokedDirectly =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  main().catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  });
}
