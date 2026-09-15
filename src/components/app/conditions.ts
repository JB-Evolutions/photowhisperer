// Condition selector + clarification chip vocabulary. Pure data — the values
// are the contract's LightCondition / BrightnessIntent, never restated EVs.
import {
  INTENT_STOPS,
  type BrightnessIntent,
  type LightCondition,
} from "@/lib/contract/types";

export type ConditionOption = { value: LightCondition; label: string };
export type ConditionGroup = { label: "Outdoor" | "Night" | "Indoor"; options: ConditionOption[] };

export const CONDITION_GROUPS: readonly ConditionGroup[] = [
  {
    label: "Outdoor",
    options: [
      { value: "snow_sand", label: "Snow or sand" },
      { value: "direct_sun", label: "Direct sun" },
      { value: "hazy_sun", label: "Hazy sun" },
      { value: "overcast", label: "Overcast" },
      { value: "open_shade", label: "Open shade" },
      { value: "golden_hour", label: "Golden hour" },
      { value: "blue_hour", label: "Blue hour" },
    ],
  },
  {
    label: "Night",
    options: [
      { value: "night_street", label: "Street lights" },
      { value: "night_no_street", label: "No street lights" },
      { value: "night_moonlit", label: "Moonlight" },
    ],
  },
  {
    label: "Indoor",
    options: [
      { value: "indoor_window", label: "Window light" },
      { value: "indoor_artificial", label: "Room lighting" },
      { value: "indoor_dim", label: "Dim room" },
      { value: "candlelit", label: "Candlelight" },
    ],
  },
];

export const LET_IT_DECIDE_LABEL = "Let it decide";
// Collapsed-row stand-in for "Let it decide" — short enough for the chip.
const LET_IT_DECIDE_SHORT = "Auto";

export const DEFAULT_INTENT: BrightnessIntent = "natural";

const INTENT_LABELS: Record<BrightnessIntent, string> = {
  moody: "Moody",
  natural: "Natural",
  bright: "Bright",
};

// "−1 stop" uses U+2212 so it lines up with "+1 stop" typographically.
export function formatStops(stops: number): string {
  if (stops === 0) return "0";
  const sign = stops > 0 ? "+" : "−";
  const n = Math.abs(stops);
  return `${sign}${n} stop${n === 1 ? "" : "s"}`;
}

export const INTENT_OPTIONS: readonly { value: BrightnessIntent; label: string; stops: string }[] = (
  ["moody", "natural", "bright"] as const
).map((value) => ({ value, label: INTENT_LABELS[value], stops: formatStops(INTENT_STOPS[value]) }));

export function conditionLabel(condition: LightCondition | null): string {
  if (condition === null) return LET_IT_DECIDE_LABEL;
  for (const group of CONDITION_GROUPS) {
    const hit = group.options.find((o) => o.value === condition);
    if (hit) return hit.label;
  }
  return LET_IT_DECIDE_LABEL;
}

// "Auto · Natural", "Golden hour · Moody".
export function selectionSummary(condition: LightCondition | null, intent: BrightnessIntent): string {
  const lead = condition === null ? LET_IT_DECIDE_SHORT : conditionLabel(condition);
  return `${lead} · ${INTENT_LABELS[intent]}`;
}

export const CLARIFICATION_PROMPT = "Roughly how bright is it?";

export type ClarificationChip = { label: string; condition: LightCondition };

export const CLARIFICATION_CHIPS: readonly ClarificationChip[] = [
  { label: "Direct sun", condition: "direct_sun" },
  { label: "Overcast", condition: "overcast" },
  { label: "Indoors", condition: "indoor_artificial" },
  { label: "Night", condition: "night_street" },
];
