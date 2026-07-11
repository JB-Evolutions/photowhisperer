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

  return {
    scene_ev,
    motion_tier: motion_tier as MotionTier,
    support: support as Support,
    focal_length_mm,
    focal_length_assumed,
    creative_intent: creative_intent as CreativeIntent,
    white_balance: white_balance as WhiteBalance,
    scene_summary: typeof scene_summary === "string" ? scene_summary : undefined,
  };
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
    return calculateSettings(scene);
  }

  console.error("Unexpected classifier status:", obj["status"]);
  return { status: "error", message: "Received an unrecognized response status." };
}
