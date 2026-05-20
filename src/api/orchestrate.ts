import { callClassifier } from "./classifier.js";
import { calculateSettings } from "../calculator/calculate.js";
import type {
  SceneInput,
  MotionTier,
  Support,
  CreativeIntent,
  WhiteBalance,
} from "../calculator/types.js";

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
  | { status: "error"; message: string };

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
  userText: string
): Promise<OrchestrateResult> {
  let raw: string;
  try {
    raw = await callClassifier(userText);
  } catch (err) {
    console.error("Classifier API error:", err);
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
