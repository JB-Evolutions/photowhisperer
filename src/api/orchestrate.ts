import { APIError } from "@anthropic-ai/sdk";
import { callClassifier } from "./classifier";
import { calculateSettings } from "../calculator/calculate";
import type {
  SceneInput,
  MotionTier,
  Support,
  CreativeIntent,
  WhiteBalance,
} from "../calculator/types";
import type { CameraProfile, PriorContext } from "./types";

export type OrchestrateResult =
  | {
      status: "ok";
      iso: number;
      aperture: string;
      shutter_speed: string;
      white_balance: string;
      color_temperature: string | null;
      assumptions: string[];
      warnings: string[];
      scene_summary?: string;
    }
  | { status: "clarification_required"; question: string }
  | { status: "invalid_input"; message: string }
  | { status: "error"; message: string }
  // Anthropic overload/rate-limit (429/503/529) — distinct from a generic
  // classifier failure so route.ts can surface it as service_busy instead
  // of the generic error state. No message: route.ts supplies fixed copy.
  | { status: "service_busy" };

const MOTION_TIERS: readonly MotionTier[] = [
  "stationary",
  "slow",
  "moderate",
  "fast",
  "very_fast",
];
const SUPPORTS: readonly Support[] = ["handheld", "tripod", "stabilized"];
const CREATIVE_INTENTS: readonly CreativeIntent[] = [
  "shallow_dof",
  "deep_dof",
  "standard",
];
const WHITE_BALANCES: readonly WhiteBalance[] = [
  "daylight",
  "cloudy",
  "shade",
  "tungsten",
  "fluorescent",
  "flash",
  "auto",
];

function validateOkScene(obj: Record<string, unknown>): SceneInput | null {
  const {
    scene_ev,
    motion_tier,
    support,
    focal_length_mm,
    focal_length_assumed,
    creative_intent,
    white_balance,
    scene_summary,
    defaulted,
  } = obj;

  if (typeof scene_ev !== "number") return null;
  if (!MOTION_TIERS.includes(motion_tier as MotionTier)) return null;
  if (!SUPPORTS.includes(support as Support)) return null;
  if (typeof focal_length_mm !== "number" || !Number.isInteger(focal_length_mm))
    return null;
  if (typeof focal_length_assumed !== "boolean") return null;
  if (!CREATIVE_INTENTS.includes(creative_intent as CreativeIntent)) return null;
  if (!WHITE_BALANCES.includes(white_balance as WhiteBalance)) return null;
  if (scene_summary !== undefined && typeof scene_summary !== "string")
    return null;
  // Optional, absent on older classifier responses — tolerate missing, but
  // reject a malformed (non-string-array) value rather than silently drop it.
  if (
    defaulted !== undefined &&
    (!Array.isArray(defaulted) || !defaulted.every((f) => typeof f === "string"))
  )
    return null;

  return {
    scene_ev,
    motion_tier: motion_tier as MotionTier,
    support: support as Support,
    focal_length_mm,
    focal_length_assumed,
    creative_intent: creative_intent as CreativeIntent,
    white_balance: white_balance as WhiteBalance,
    scene_summary: typeof scene_summary === "string" ? scene_summary : undefined,
    defaulted: Array.isArray(defaulted) ? (defaulted as string[]) : undefined,
  };
}

// Parses the aperture spec out of a lens description: "50mm f/1.8" -> a
// constant f/1.8; "18-55mm f/3.5-5.6" -> f/3.5 at the wide end, f/5.6 at the
// tele end (a variable-aperture zoom is physically slower once zoomed in —
// this is never a single number). Returns null if no f/-number pattern is
// present.
//
// Uses only the FIRST f/-pattern found, unlike the old single-number
// widestApertureFromLensString (removed), which used matchAll + min across
// every "f/" occurrence anywhere in the string. That approach doesn't
// compose with extracting a wide/tele PAIR: there's no principled partner
// for a minimum picked from unrelated occurrences elsewhere in the string.
// A lens description is expected to state its own aperture (spec or range)
// once, immediately after its focal length — real inputs throughout this
// codebase never do otherwise. Intentional behavior change, not an oversight.
function parseLensAperture(lens: string): { wide: number; tele: number } | null {
  const match = lens.match(/f\/(\d+(?:\.\d+)?)(?:-(\d+(?:\.\d+)?))?/i);
  if (!match) return null;
  const wide = Number(match[1]);
  const tele = match[2] !== undefined ? Number(match[2]) : wide;
  return { wide, tele };
}

// Parses the focal-length range a lens covers, e.g. "70-200mm f/4" -> 70..200,
// "50mm f/1.8" -> 50..50. Strips the "f/..." aperture segment first so its
// digits (e.g. the "3.5-5.6" in "f/3.5-5.6") are never mistaken for a focal
// range. Anchored to a number (or range) immediately followed by "mm", so a
// brand name with a leading digit ("7artisans 35mm f/1.2") isn't mistaken
// for a focal length — the bare "7" isn't followed by "mm" so it's skipped
// in favor of "35mm". Returns null when nothing matches that pattern.
//
// NOTE: assumes the lens's mm figure is directly comparable to
// focal_length_mm — i.e. both full-frame-equivalent. Physical lens mm on
// APS-C/MFT bodies differs from full-frame-equivalent by a 1.5-2x crop
// factor that this does not correct for (camera_profile.body is free text
// with no reliable sensor-size mapping). Known limitation: matching may
// mis-scope for non-full-frame gear.
function parseLensFocalRange(lens: string): { minFocal: number; maxFocal: number } | null {
  const apertureMatch = lens.match(/f\/(\d+(?:\.\d+)?)(?:-\d+(?:\.\d+)?)?/i);
  const withoutAperture = apertureMatch
    ? lens.slice(0, apertureMatch.index) + lens.slice(apertureMatch.index! + apertureMatch[0].length)
    : lens;

  const focalMatch = withoutAperture.match(/(\d+)(?:\s*-\s*(\d+))?\s*mm\b/i);
  if (!focalMatch) return null;

  const f1 = Number(focalMatch[1]);
  const f2 = focalMatch[2] !== undefined ? Number(focalMatch[2]) : f1;
  return { minFocal: Math.min(f1, f2), maxFocal: Math.max(f1, f2) };
}

// Linearly interpolates a variable-aperture zoom's f-number between its wide
// and tele ends based on where focal_length_mm sits in the lens's focal
// range. A constant-aperture lens (wide === tele) or a prime (minFocal ===
// maxFocal) just returns its one aperture, exactly — the manufacturer-stated
// endpoint values are exact, not an approximation. A focal length exactly at
// either endpoint likewise returns that endpoint's exact value. A focal
// length strictly BETWEEN the endpoints returns the raw linear estimate —
// calculate.ts's nearestStandardApertureAtOrNarrowerThan rounds this to the
// grid (always narrower, never nearest) when it's actually consumed, so
// rounding here too would just be redundant duplicate logic.
function effectiveApertureAtFocal(
  apertureSpec: { wide: number; tele: number },
  range: { minFocal: number; maxFocal: number },
  focal_length_mm: number
): number {
  if (apertureSpec.wide === apertureSpec.tele || range.minFocal === range.maxFocal) {
    return apertureSpec.wide;
  }
  const t = (focal_length_mm - range.minFocal) / (range.maxFocal - range.minFocal);
  if (t <= 0) return apertureSpec.wide;
  if (t >= 1) return apertureSpec.tele;
  return apertureSpec.wide + (apertureSpec.tele - apertureSpec.wide) * t;
}

// The widest aperture (smallest f-number) actually usable at the scene's
// focal length, selected only from lens(es) whose parsed focal range covers
// it, and interpolated to the physically correct aperture at that exact
// focal length for variable-aperture zooms — a 50mm f/1.8 must not license
// f/1.8 at 200mm, and an 18-55mm f/3.5-5.6 must not license f/3.5 at 55mm
// (it's physically f/5.6 there).
//
// Returns null when a numeric value can't be confidently attributed to a
// lens that covers this exact focal length: no gear at all, no lens with a
// parseable aperture, or (with a real, user-stated focal length) no lens's
// parsed range covering it. That last case — a real focal length the kit
// genuinely can't reach — is the one place null is the only honest answer;
// there's nothing to fall back to that isn't a guess.
//
// focal_length_assumed is different: there's no real focal length being
// violated, since the 50mm figure is itself a guess, not a request. In that
// case this returns the widest wide-end aperture anywhere in the kit
// instead of null — it can never be wider than what's actually in the bag,
// so unlike guessing a *specific* lens covers a *specific* (possibly wrong)
// focal length, it's a sound ceiling: strictly safer than falling back to
// the generic unknown-gear policy limit, which could be wider than every
// lens the user owns.
export function deriveMaxAperture(
  camera_profile: CameraProfile | null,
  focal_length_mm: number,
  focal_length_assumed: boolean
): number | null {
  if (!camera_profile?.lenses || camera_profile.lenses.length === 0) return null;

  const apertures = camera_profile.lenses
    .map((lens) => parseLensAperture(lens))
    .filter((a): a is { wide: number; tele: number } => a !== null);

  if (apertures.length === 0) return null;

  if (focal_length_assumed) {
    return Math.min(...apertures.map((a) => a.wide));
  }

  const parsed = camera_profile.lenses
    .map((lens) => {
      const apertureSpec = parseLensAperture(lens);
      const range = parseLensFocalRange(lens);
      return apertureSpec !== null && range !== null ? { apertureSpec, range } : null;
    })
    .filter(
      (l): l is { apertureSpec: { wide: number; tele: number }; range: { minFocal: number; maxFocal: number } } =>
        l !== null
    );

  const covering = parsed.filter(
    (l) => focal_length_mm >= l.range.minFocal && focal_length_mm <= l.range.maxFocal
  );
  if (covering.length === 0) return null;

  const effectiveApertures = covering.map((l) =>
    effectiveApertureAtFocal(l.apertureSpec, l.range, focal_length_mm)
  );
  return Math.min(...effectiveApertures);
}

export async function getSettings(
  conditions: string,
  camera_profile: CameraProfile | null = null,
  prior_context: PriorContext | null = null
): Promise<OrchestrateResult> {
  let raw: string;
  try {
    raw = await callClassifier(conditions, camera_profile, prior_context);
  } catch (err) {
    console.error("Classifier API error:", err);
    // Only 429/503/529 (rate-limit/overloaded) count as "busy" — a plain 500,
    // a network error, or anything else stays the generic error path.
    if (
      err instanceof APIError &&
      err.status !== undefined &&
      [429, 503, 529].includes(err.status)
    ) {
      return { status: "service_busy" };
    }
    return { status: "error", message: "Failed to reach the classification service." };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    console.error("Classifier returned invalid JSON:", err);
    return {
      status: "error",
      message: "Received an invalid response from the classification service.",
    };
  }

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    Array.isArray(parsed)
  ) {
    console.error("Classifier response is not an object:", parsed);
    return { status: "error", message: "Received an unexpected response shape." };
  }

  const obj = parsed as Record<string, unknown>;

  if (obj["status"] === "clarification_required") {
    if (typeof obj["question"] !== "string") {
      console.error("clarification_required missing question:", obj);
      return { status: "error", message: "Received an invalid clarification response." };
    }
    return { status: "clarification_required", question: obj["question"] };
  }

  if (obj["status"] === "invalid_input") {
    const message =
      typeof obj["message"] === "string"
        ? obj["message"]
        : "Input not recognized as a photography scene.";
    return { status: "invalid_input", message };
  }

  if (obj["status"] === "ok") {
    const scene = validateOkScene(obj);
    if (!scene) {
      console.error("Classifier ok response failed validation:", obj);
      return { status: "error", message: "Received an invalid scene classification." };
    }

    const max_aperture = deriveMaxAperture(camera_profile, scene.focal_length_mm, scene.focal_length_assumed);

    return calculateSettings({ ...scene, max_aperture });
  }

  console.error("Unexpected classifier status:", obj["status"]);
  return { status: "error", message: "Received an unrecognized response status." };
}
