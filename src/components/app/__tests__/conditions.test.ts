import { describe, expect, it } from "vitest";
import { LIGHT_CONDITION_EV } from "@/lib/contract/types";
import {
  CLARIFICATION_CHIPS,
  CLARIFICATION_PROMPT,
  CONDITION_GROUPS,
  DEFAULT_INTENT,
  INTENT_OPTIONS,
  conditionLabel,
  formatStops,
  selectionSummary,
} from "@/components/app/conditions";

describe("condition vocabulary", () => {
  it("lists every LightCondition exactly once", () => {
    const listed = CONDITION_GROUPS.flatMap((g) => g.options.map((o) => o.value));
    expect(listed).toHaveLength(18);
    expect(new Set(listed).size).toBe(18);
    expect([...listed].sort()).toEqual(Object.keys(LIGHT_CONDITION_EV).sort());
  });

  it("groups Outdoor, Night, Indoor, Lit subject in that order", () => {
    expect(CONDITION_GROUPS.map((g) => g.label)).toEqual([
      "Outdoor",
      "Night",
      "Indoor",
      "Lit subject",
    ]);
  });

  it("defaults to Let it decide and Natural", () => {
    expect(DEFAULT_INTENT).toBe("natural");
    expect(conditionLabel(null)).toBe("Let it decide");
    expect(selectionSummary(null, DEFAULT_INTENT)).toBe("Auto · Natural");
    expect(selectionSummary("golden_hour", "moody")).toBe("Golden hour · Moody");
  });

  it("labels the brightness axis in stops", () => {
    expect(INTENT_OPTIONS.map((o) => [o.label, o.stops])).toEqual([
      ["Moody", "−1 stop"],
      ["Natural", "0"],
      ["Bright", "+1 stop"],
    ]);
    expect(formatStops(2)).toBe("+2 stops");
  });
});

describe("clarification chips", () => {
  it("map to the agreed conditions", () => {
    expect(CLARIFICATION_CHIPS.map((c) => [c.label, c.condition])).toEqual([
      ["Direct sun", "direct_sun"],
      ["Overcast", "overcast"],
      ["Indoors", "indoor_artificial"],
      ["Night", "night_street"],
    ]);
  });

  it("never mention EXIF, metadata or missing data", () => {
    expect(CLARIFICATION_PROMPT).toBe("Roughly how bright is it?");
    expect(CLARIFICATION_PROMPT).not.toMatch(/exif|metadata|missing/i);
  });
});
