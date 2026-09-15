import { APIError } from "@anthropic-ai/sdk";
import { callClassifier } from "./classifier";
import { solveExposure } from "../calculator/ladder";
import { roundToCameraSteps } from "../calculator/round";
import { AUTO_ISO_CEILING, WB_COLOR_TEMP } from "../calculator/constants";
import { formatAperture, formatShutter } from "../calculator/format";
import { describeShutter } from "../calculator/shutterFloor";
import type { WhiteBalance } from "../calculator/types";
import {
  INTENT_STOPS,
  LIGHT_CONDITION_EV,
  type BodyProfile,
  type BrightnessIntent,
  type LensProfile,
  type LightCondition,
  type SubjectMotion,
  type Support,
} from "../lib/contract/types";
import { resolveSceneEv, SUBJECT_OFFSET_STOPS } from "../lib/exposure/ev";
import type { SubjectExposureVerdict } from "../lib/exposure/types";
import { apertureAtFocal, parseLensString } from "../lib/lens/parse";
import type { CameraProfile, GearProfile, ImageInput, PriorContext } from "./types";

export type OrchestrateResult =
  | {
      status: "ok";
      iso: number;
      // WIDEST_APERTURE_LABEL when the lens's aperture is unknown.
      aperture: string;
      shutter_speed: string;
      white_balance: string;
      color_temperature: string | null;
      assumptions: string[];
      warnings: string[];
      scene_summary?: string;
      // The shutter floor's one-line reason (ShutterFloor.explain).
      floorExplain: string;
      // Stops short of a correct exposure after rounding; 0 when reachable.
      shortfallStops: number;
    }
  | { status: "clarification_required"; question: string }
  | { status: "invalid_input"; message: string }
  | { status: "error"; message: string }
  // Anthropic overload/rate-limit (429/503/529) — distinct from a generic
  // classifier failure so route.ts can surface it as service_busy instead
  // of the generic error state. No message: route.ts supplies fixed copy.
  | { status: "service_busy" };

export type GetSettingsOptions = {
  image?: ImageInput | null;
  // The composer's condition selector. User-stated, so never routed through
  // the model and never second-guessed by it.
  condition?: LightCondition | null;
  intent?: BrightnessIntent;
  // sessions.clarification_used — true once this session has been asked.
  clarificationUsed?: boolean;
};

export const WIDEST_APERTURE_LABEL = "widest your lens allows";

// The only question the orchestrator ever asks, at most once per session.
export const CLARIFICATION_QUESTION =
  "What's the light like — sunny, overcast, shade, indoors, or night?";

export const HIGHLIGHT_WARNING =
  "Bright light sources in frame (lamps, windows, or signs) will clip before the rest of the scene is exposed. Shoot RAW and expose for the highlights, or bracket.";

const MOTIONS: readonly SubjectMotion[] = ["static", "slow", "walking", "fast"];
const SUPPORTS: readonly Support[] = ["handheld", "tripod"];
const WHITE_BALANCES: readonly WhiteBalance[] = [
  "daylight",
  "cloudy",
  "shade",
  "tungsten",
  "fluorescent",
  "flash",
  "auto",
];
const LIGHTING_DIRECTIONS = ["front", "side", "back", "top", "diffuse", "unknown"] as const;
type LightingDirection = (typeof LIGHTING_DIRECTIONS)[number];
const LIGHT_CONDITIONS = Object.keys(LIGHT_CONDITION_EV) as readonly LightCondition[];
const VERDICTS = Object.keys(SUBJECT_OFFSET_STOPS) as readonly SubjectExposureVerdict[];
export const BRIGHTNESS_INTENTS = Object.keys(INTENT_STOPS) as readonly BrightnessIntent[];

const MAX_FOCAL_MM = 2000;

type ClassifiedScene = {
  motion: SubjectMotion;
  support: Support;
  focal_length_mm: number | null;
  white_balance: WhiteBalance;
  lighting_direction: LightingDirection;
  highlight_risk: boolean;
  scene_summary?: string;
  defaulted: string[];
  subject_exposure_verdict: SubjectExposureVerdict | null;
  condition: LightCondition | null;
  // Overwritten from resolveSceneEv before solving; never read from the model.
  scene_ev: number | null;
};

function validateOkScene(obj: Record<string, unknown>): ClassifiedScene | null {
  const {
    motion,
    support,
    focal_length_mm,
    white_balance,
    lighting_direction,
    highlight_risk,
    scene_summary,
    defaulted,
    subject_exposure_verdict,
    condition,
  } = obj;

  if (!MOTIONS.includes(motion as SubjectMotion)) return null;
  if (!SUPPORTS.includes(support as Support)) return null;
  if (!WHITE_BALANCES.includes(white_balance as WhiteBalance)) return null;
  if (
    focal_length_mm !== undefined &&
    focal_length_mm !== null &&
    (typeof focal_length_mm !== "number" ||
      !Number.isInteger(focal_length_mm) ||
      focal_length_mm < 1 ||
      focal_length_mm > MAX_FOCAL_MM)
  )
    return null;
  if (
    lighting_direction !== undefined &&
    !LIGHTING_DIRECTIONS.includes(lighting_direction as LightingDirection)
  )
    return null;
  if (highlight_risk !== undefined && typeof highlight_risk !== "boolean") return null;
  if (scene_summary !== undefined && typeof scene_summary !== "string") return null;
  // Optional fields below: absence is tolerated, a malformed value is rejected
  // rather than silently dropped.
  if (
    defaulted !== undefined &&
    (!Array.isArray(defaulted) || !defaulted.every((f) => typeof f === "string"))
  )
    return null;
  if (
    subject_exposure_verdict !== undefined &&
    subject_exposure_verdict !== null &&
    !VERDICTS.includes(subject_exposure_verdict as SubjectExposureVerdict)
  )
    return null;
  if (
    condition !== undefined &&
    condition !== null &&
    !LIGHT_CONDITIONS.includes(condition as LightCondition)
  )
    return null;

  return {
    motion: motion as SubjectMotion,
    support: support as Support,
    focal_length_mm: typeof focal_length_mm === "number" ? focal_length_mm : null,
    white_balance: white_balance as WhiteBalance,
    lighting_direction:
      lighting_direction !== undefined ? (lighting_direction as LightingDirection) : "unknown",
    highlight_risk: highlight_risk === true,
    scene_summary: typeof scene_summary === "string" ? scene_summary : undefined,
    defaulted: Array.isArray(defaulted) ? (defaulted as string[]) : [],
    subject_exposure_verdict:
      subject_exposure_verdict != null ? (subject_exposure_verdict as SubjectExposureVerdict) : null,
    condition: condition != null ? (condition as LightCondition) : null,
    scene_ev: null,
  };
}

// An older prompt could still answer clarification_required. The orchestrator
// owns clarification now, so that answer is treated as a scene with nothing
// specified and goes through the same light resolution and cap.
const UNSPECIFIED_SCENE: ClassifiedScene = {
  motion: "static",
  support: "handheld",
  focal_length_mm: null,
  white_balance: "auto",
  lighting_direction: "unknown",
  highlight_risk: false,
  defaulted: ["motion", "support", "white_balance"],
  subject_exposure_verdict: null,
  condition: null,
  scene_ev: null,
};

// ─── Light condition from text ────────────────────────────────────────────────

const CONDITION_LABEL: Record<LightCondition, string> = {
  snow_sand: "bright snow or sand",
  direct_sun: "direct sun",
  hazy_sun: "hazy sun",
  overcast: "overcast",
  open_shade: "open shade",
  golden_hour: "golden hour",
  blue_hour: "blue hour",
  night_street: "a street-lit night",
  night_no_street: "night without street lights",
  night_moonlit: "a moonlit night",
  indoor_window: "indoor window light",
  indoor_artificial: "indoor artificial light",
  indoor_dim: "dim indoor light",
  candlelit: "candlelight",
};

const INDOOR_RE =
  /\b(indoors?|inside|room|kitchen|lounge|bedroom|bathroom|office|cafes?|restaurant|bar|pub|shop|store|hall|church|museum|gym|studio|home|house|hotel|classroom)\b|café|🏠/iu;

type TextRule = {
  re: RegExp;
  outdoor: LightCondition;
  indoor: LightCondition;
};

// Time-of-day, light-source and weather tokens, most specific first — the
// first match wins, so "sunset" is read before "sun" and "partly cloudy"
// before "cloudy". A bare place word ("park", "kitchen") is not a token: it
// only decides between the outdoor and indoor reading of one.
const TEXT_RULES: readonly TextRule[] = [
  { re: /\b(candle\w*|firelight|fireplace|campfire)\b|🕯️?|🔥/iu, outdoor: "candlelit", indoor: "candlelit" },
  { re: /\b(snow\w*|skiing|sand)\b|❄️?|⛄|☃️?/iu, outdoor: "snow_sand", indoor: "indoor_window" },
  { re: /\b(golden hour|sunset|sunrise)\b|🌅|🌄/iu, outdoor: "golden_hour", indoor: "indoor_window" },
  { re: /\b(blue hour|dusk|twilight)\b/iu, outdoor: "blue_hour", indoor: "indoor_dim" },
  { re: /\b(moon\w*)\b|🌙|🌛|🌜|🌕|🌝/iu, outdoor: "night_moonlit", indoor: "indoor_dim" },
  { re: /\b(no street ?lights?|pitch black|stars|starlight|milky way)\b|🌌/iu, outdoor: "night_no_street", indoor: "indoor_dim" },
  { re: /\b(street ?lights?|street ?lamps?|city lights|neon)\b|🌃|🌆|🌉/iu, outdoor: "night_street", indoor: "indoor_artificial" },
  { re: /\b(dim|dimly|dimmed|low[- ]light|dark room)\b/iu, outdoor: "blue_hour", indoor: "indoor_dim" },
  { re: /\b(window light|windows?)\b|🪟/iu, outdoor: "indoor_window", indoor: "indoor_window" },
  { re: /\b(lamps?|tungsten|fluorescent|led|bulbs?|ceiling lights?|overhead lights?|spotlights?)\b|💡/iu, outdoor: "night_street", indoor: "indoor_artificial" },
  { re: /\b(open shade|shade|shady|shaded|under (the )?trees)\b|🌳/iu, outdoor: "open_shade", indoor: "indoor_artificial" },
  { re: /\b(haze|hazy|thin cloud|light cloud|partly cloudy)\b|⛅|🌤️?/iu, outdoor: "hazy_sun", indoor: "indoor_window" },
  { re: /\b(overcast|cloudy|clouds?|gr[ae]y sky|rain\w*|drizzle|fog\w*|mist\w*|storm\w*)\b|☁️?|🌧️?|🌥️?|⛈️?|🌫️?/iu, outdoor: "overcast", indoor: "indoor_artificial" },
  { re: /\b(sunny|sunshine|sunlight|sunlit|sun|clear sky|blue sky)\b|☀️?|🌞/iu, outdoor: "direct_sun", indoor: "indoor_window" },
  { re: /\b(night\w*|after dark|evening)\b/iu, outdoor: "night_street", indoor: "indoor_artificial" },
  { re: /\b(morning|afternoon|midday|noon|daytime|daylight|day)\b/iu, outdoor: "hazy_sun", indoor: "indoor_window" },
];

// With no token at all, a photo is more often indoors than not, and indoor
// artificial light sits mid-range so the miss is a stop or two either way.
const NO_TOKEN_OUTDOOR: LightCondition = "overcast";
const NO_TOKEN_INDOOR: LightCondition = "indoor_artificial";

export function inferConditionFromText(
  text: string
): { condition: LightCondition; token: string } | null {
  const indoor = INDOOR_RE.test(text);
  for (const rule of TEXT_RULES) {
    const match = rule.re.exec(text);
    if (match) return { condition: indoor ? rule.indoor : rule.outdoor, token: match[0] };
  }
  return null;
}

// Nearest condition when there is no token to go on (empty, emoji, free text).
function fallbackCondition(text: string): LightCondition {
  return INDOOR_RE.test(text) ? NO_TOKEN_INDOOR : NO_TOKEN_OUTDOOR;
}

// solveExposure takes a LightCondition, not an EV, so a measured EV is matched
// to the nearest table entry. Ties go to the darker entry.
function nearestConditionForEv(ev: number): LightCondition {
  let best = LIGHT_CONDITIONS[0];
  for (const c of LIGHT_CONDITIONS) {
    const d = Math.abs(LIGHT_CONDITION_EV[c] - ev);
    const bestD = Math.abs(LIGHT_CONDITION_EV[best] - ev);
    if (d < bestD - 1e-9 || (Math.abs(d - bestD) <= 1e-9 && LIGHT_CONDITION_EV[c] < LIGHT_CONDITION_EV[best])) {
      best = c;
    }
  }
  return best;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

// ─── Gear ─────────────────────────────────────────────────────────────────────

const DEFAULT_BODY: BodyProfile = {
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

// Normal field of view, as a full-frame focal length.
const NORMAL_FOCAL_FF_MM = 50;

function isGearProfile(p: GearProfile | CameraProfile): p is GearProfile {
  return typeof p.body === "object" && p.body !== null;
}

// The legacy free-text profile is parsed the same way the stored lens rows are.
function toGear(profile: GearProfile | CameraProfile | null): GearProfile {
  if (!profile) return { body: DEFAULT_BODY, lenses: [] };
  if (isGearProfile(profile)) return profile;
  return {
    body: { ...DEFAULT_BODY, label: profile.body ?? DEFAULT_BODY.label },
    lenses: (profile.lenses ?? [])
      .filter((l) => typeof l === "string" && l.trim() !== "")
      .map(parseLensString),
  };
}

function chooseLens(
  gear: GearProfile,
  statedFocal: number | null
): { lens: LensProfile; focalMm: number; assumptions: string[] } {
  const { body, lenses } = gear;
  const assumptions: string[] = [];
  const normalFocal = Math.round(NORMAL_FOCAL_FF_MM / (body.cropFactor ?? 1));

  if (statedFocal !== null) {
    const covering = lenses.filter(
      (l) =>
        l.focalMinMm !== null &&
        l.focalMaxMm !== null &&
        statedFocal >= l.focalMinMm &&
        statedFocal <= l.focalMaxMm
    );
    if (covering.length > 0) {
      // Widest aperture at this focal length; unknown apertures sort last.
      const ranked = [...covering].sort(
        (a, b) =>
          (apertureAtFocal(a, statedFocal) ?? Infinity) - (apertureAtFocal(b, statedFocal) ?? Infinity)
      );
      const lens = ranked[0];
      if (apertureAtFocal(lens, statedFocal) === null) {
        assumptions.push(
          `Couldn't read the aperture of "${lens.label}" — aperture shown as the ${WIDEST_APERTURE_LABEL}.`
        );
      }
      return { lens, focalMm: statedFocal, assumptions };
    }
    assumptions.push(
      lenses.length === 0
        ? `No lens in your camera profile — aperture shown as the ${WIDEST_APERTURE_LABEL}.`
        : `None of your lenses is known to cover ${statedFocal}mm — aperture shown as the ${WIDEST_APERTURE_LABEL}.`
    );
    return { lens: UNKNOWN_LENS, focalMm: statedFocal, assumptions };
  }

  if (lenses.length === 0) {
    assumptions.push(`Assumed ${normalFocal}mm (focal length not specified).`);
    assumptions.push(`No lens in your camera profile — aperture shown as the ${WIDEST_APERTURE_LABEL}.`);
    return { lens: UNKNOWN_LENS, focalMm: normalFocal, assumptions };
  }

  const lens = lenses.find((l) => l.focalMinMm !== null && l.focalMaxMm !== null) ?? lenses[0];
  const focalMm =
    lens.focalMinMm !== null && lens.focalMaxMm !== null
      ? Math.min(Math.max(normalFocal, lens.focalMinMm), lens.focalMaxMm)
      : normalFocal;
  assumptions.push(`Assumed ${focalMm}mm on your ${lens.label} (focal length not specified).`);
  if (apertureAtFocal(lens, focalMm) === null) {
    assumptions.push(
      `Couldn't read the aperture of "${lens.label}" — aperture shown as the ${WIDEST_APERTURE_LABEL}.`
    );
  }
  return { lens, focalMm, assumptions };
}

// ─── Result assembly ──────────────────────────────────────────────────────────

const DEFAULTED_ASSUMPTION_TEXT: Record<string, string> = {
  motion: "Assumed subject is stationary (movement not specified).",
  support: "Assumed handheld (support not specified).",
  white_balance: "Assumed auto white balance (lighting colour not specified).",
};

function isoCeilingFor(body: BodyProfile): number | undefined {
  if (body.isoMode === "capped") return body.isoMax ?? undefined;
  if (body.isoMode === "locked") return body.isoValue ?? body.isoBase;
  return undefined;
}

function shortfallLine(
  stops: number,
  body: BodyProfile,
  iso: number,
  aperture: number | null,
  floorS: number
): string {
  let cause: string;
  if (body.isoMode === "locked") {
    cause = `your locked ISO (ISO ${iso})`;
  } else if (body.isoMode === "capped" && body.isoMax !== null) {
    cause = `your ISO cap (ISO ${iso})`;
  } else {
    cause = `the ISO cap (ISO ${Math.min(iso, AUTO_ISO_CEILING)})`;
  }
  const lensPart = aperture !== null ? ` and the lens aperture limit (${formatAperture(aperture)})` : "";
  return `Still ${stops.toFixed(1)} stops underexposed — limited by ${cause}${lensPart}, with the shutter at its ${describeShutter(floorS)} floor.`;
}

function solveAndFormat(args: {
  scene: ClassifiedScene;
  condition: LightCondition;
  intent: BrightnessIntent;
  gear: GearProfile;
  lightAssumptions: string[];
}): OrchestrateResult {
  const { scene, condition, intent, gear, lightAssumptions } = args;
  const { body } = gear;
  const { lens, focalMm, assumptions: lensAssumptions } = chooseLens(gear, scene.focal_length_mm);

  const raw = solveExposure({
    light: condition,
    intent,
    focalMm,
    body,
    lens,
    motion: scene.motion,
    support: scene.support,
  });
  // Rounded BEFORE anything reaches the response: the user dials camera steps.
  const rounded = roundToCameraSteps(raw, isoCeilingFor(body));

  const assumptions: string[] = [...lightAssumptions];
  for (const field of scene.defaulted) {
    const text = DEFAULTED_ASSUMPTION_TEXT[field];
    if (text) assumptions.push(text);
  }
  assumptions.push(...lensAssumptions);
  if (body.cropFactor === null) {
    assumptions.push("Assumed a full-frame sensor (crop factor not set in your camera profile).");
  }
  if (scene.support === "handheld" && lens !== UNKNOWN_LENS && lens.stabilised === null && !body.ibisStops) {
    assumptions.push(`Stabilisation of "${lens.label}" unknown — assumed none for the shutter floor.`);
  }

  // A raw shortfall is a real limit. Rounding alone can open a sliver of a gap
  // (e.g. a too-bright scene's shutter snapping faster), which isn't one.
  const shortfallStops = raw.shortfallStops > 0 ? rounded.shortfallStops : 0;
  if (shortfallStops >= 0.05) {
    assumptions.push(shortfallLine(shortfallStops, body, rounded.iso, rounded.aperture, rounded.shutterS));
  }

  const colorTemp = WB_COLOR_TEMP[scene.white_balance];

  return {
    status: "ok",
    iso: rounded.iso,
    aperture: rounded.aperture === null ? WIDEST_APERTURE_LABEL : formatAperture(rounded.aperture),
    shutter_speed: formatShutter(rounded.shutterS),
    white_balance: scene.white_balance,
    color_temperature: colorTemp !== null ? `${colorTemp}K` : null,
    assumptions,
    warnings: scene.highlight_risk ? [HIGHLIGHT_WARNING] : [],
    scene_summary: scene.scene_summary,
    floorExplain: rounded.floor.explain,
    shortfallStops: shortfallStops >= 0.05 ? round1(shortfallStops) : 0,
  };
}

export async function getSettings(
  conditions: string,
  camera_profile: GearProfile | CameraProfile | null = null,
  prior_context: PriorContext | null = null,
  options: GetSettingsOptions = {}
): Promise<OrchestrateResult> {
  const image = options.image ?? null;
  const intent = options.intent ?? "natural";
  const clarificationUsed = options.clarificationUsed === true;

  let raw: string;
  try {
    raw = await callClassifier(conditions, prior_context, image);
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

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    console.error("Classifier response is not an object:", parsed);
    return { status: "error", message: "Received an unexpected response shape." };
  }

  const obj = parsed as Record<string, unknown>;

  if (obj["status"] === "invalid_input") {
    const message =
      typeof obj["message"] === "string"
        ? obj["message"]
        : "Input not recognized as a photography scene.";
    return { status: "invalid_input", message };
  }

  let scene: ClassifiedScene;
  if (obj["status"] === "ok") {
    const validated = validateOkScene(obj);
    if (!validated) {
      console.error("Classifier ok response failed validation:", obj);
      return { status: "error", message: "Received an invalid scene classification." };
    }
    scene = validated;
  } else if (obj["status"] === "clarification_required") {
    scene = { ...UNSPECIFIED_SCENE };
  } else {
    console.error("Unexpected classifier status:", obj["status"]);
    return { status: "error", message: "Received an unrecognized response status." };
  }

  // scene.exposure_bias_stops is deliberately never read: metering correction
  // is folded into scene_ev, and BrightnessIntent is the only creative bias.
  const resolution = resolveSceneEv({
    exif: image?.exif ?? null,
    verdict: image ? scene.subject_exposure_verdict : null,
    histogram: image?.histogram ?? null,
    hdrSuspect: image?.rawExifFlags.hdrSuspect ?? false,
    // The model's condition is only asked for on a photo without EXIF; text
    // requests never take light from the model.
    condition: image ? scene.condition : null,
  });
  scene.scene_ev = resolution.scene_ev;

  const lightAssumptions: string[] = [];
  let condition: LightCondition;

  if (resolution.tier === 1 && resolution.scene_ev !== null) {
    condition = nearestConditionForEv(resolution.scene_ev);
    if (resolution.assumption) lightAssumptions.push(resolution.assumption);
    if (Math.abs(LIGHT_CONDITION_EV[condition] - resolution.scene_ev) >= 0.5) {
      lightAssumptions.push(
        `Measured light (EV ${round1(resolution.scene_ev)}) matched to the nearest light level, ${CONDITION_LABEL[condition]} (EV ${LIGHT_CONDITION_EV[condition]}).`
      );
    }
  } else if (options.condition) {
    // Stated by the user: taken as-is, no assumption line.
    condition = options.condition;
    scene.scene_ev = LIGHT_CONDITION_EV[condition];
  } else if (resolution.tier === 2 && scene.condition !== null) {
    condition = scene.condition;
    if (resolution.assumption) lightAssumptions.push(resolution.assumption);
  } else {
    // Tier 3: nothing measured or estimated.
    const inferred = inferConditionFromText(conditions);
    if (inferred) {
      condition = inferred.condition;
      lightAssumptions.push(
        `Light read as ${CONDITION_LABEL[condition]} from "${inferred.token}".`
      );
    } else if (!clarificationUsed) {
      return { status: "clarification_required", question: CLARIFICATION_QUESTION };
    } else {
      condition = fallbackCondition(conditions);
      lightAssumptions.push(
        `No light level given, so assumed ${CONDITION_LABEL[condition]} — pick a light condition for exact settings.`
      );
    }
    scene.scene_ev = LIGHT_CONDITION_EV[condition];
  }

  return solveAndFormat({
    scene,
    condition,
    intent,
    gear: toGear(camera_profile),
    lightAssumptions,
  });
}
