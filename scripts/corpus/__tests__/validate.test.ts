import { describe, it, expect } from "vitest";
import { LIGHT_CONDITION_EV } from "@/lib/contract/types";
import {
  CONDITION_AXIS,
  CONDITION_PLACEMENT,
  CONDITION_IDS,
  assertLightConditionId,
  isLightConditionId,
  type CorpusDraftEntry,
  type LightConditionId,
} from "../manifest";
import { validateEntry, stratify, EV_GAP_WARN_STOPS, UNDERPOWERED_N } from "../validate";

function entry(over: Partial<CorpusDraftEntry> = {}): CorpusDraftEntry {
  return {
    id: "aaaaaaaaaaaa",
    file: "day1/DSCF0001.jpg",
    capturedAt: "2026-03-01T10:00:00.000Z",
    condition: "overcast",
    indoor: false,
    subjectLit: false,
    groundTruth: { ev100: 13, source: "exif_auto_judged", judgedOffStops: 0, confidence: "medium" },
    exif: {
      present: true, iso: 100, apertureN: 8, shutterSec: 1 / 128,
      exposureBiasEv: 0, meteringMode: "pattern", make: "FUJIFILM", model: "X-T5",
    },
    notes: null,
    ...over,
  };
}

const codes = (e: CorpusDraftEntry) => validateEntry(e).map((i) => `${i.level}:${i.code}`);

describe("the label vocabulary tracks the contract", () => {
  it("classifies every LIGHT_CONDITION_EV key on both axes and nothing else", () => {
    const keys = Object.keys(LIGHT_CONDITION_EV).sort();
    expect([...CONDITION_IDS].sort()).toEqual(keys);
    expect(Object.keys(CONDITION_AXIS).sort()).toEqual(keys);
    expect(Object.keys(CONDITION_PLACEMENT).sort()).toEqual(keys);
  });

  it("puts exactly the four subject-brightness conditions on the subject axis", () => {
    const subject = CONDITION_IDS.filter((c) => CONDITION_AXIS[c] === "subject").sort();
    expect(subject).toEqual(["fireworks", "moon_subject", "neon_signage", "stage_lit"]);
  });

  it("treats an unknown condition as a hard error, not a warning", () => {
    expect(isLightConditionId("golden_hour")).toBe(true);
    expect(isLightConditionId("golden_hours")).toBe(false);
    expect(() => assertLightConditionId("golden_hours", "test")).toThrow(/not a key of LIGHT_CONDITION_EV/);
    expect(codes(entry({ condition: "golden_hours" as LightConditionId }))).toContain("error:condition_unknown");
  });
});

describe("validateEntry", () => {
  it("passes a well-formed entry", () => {
    expect(validateEntry(entry())).toEqual([]);
  });

  it("errors on an unlabelled condition", () => {
    expect(codes(entry({ condition: null }))).toContain("error:condition_unknown");
  });

  it("errors when subjectLit disagrees with the condition's axis", () => {
    expect(codes(entry({ condition: "overcast", subjectLit: true }))).toContain("error:subject_lit_mismatch");
    expect(codes(entry({ condition: "fireworks", indoor: false, subjectLit: false, groundTruth: entry().groundTruth }))).toContain("error:subject_lit_mismatch");
    // …and is silent when they agree.
    const ok = entry({ condition: "fireworks", indoor: false, subjectLit: true, groundTruth: { ev100: 10, source: "exif_manual", judgedOffStops: 0, confidence: "high" } });
    expect(validateEntry(ok)).toEqual([]);
  });

  it("errors when indoor disagrees with where the condition can occur", () => {
    expect(codes(entry({ condition: "direct_sun", indoor: true }))).toContain("error:indoor_mismatch");
    expect(codes(entry({ condition: "indoor_dim", indoor: false, groundTruth: { ev100: 5, source: "meter", judgedOffStops: 0, confidence: "high" } }))).toContain("error:indoor_mismatch");
    expect(codes(entry({ condition: "overcast", indoor: null }))).toContain("error:indoor_unset");
  });

  it("accepts either placement for a condition that genuinely occurs both ways", () => {
    const base = { condition: "stage_lit" as LightConditionId, subjectLit: true, groundTruth: { ev100: 11, source: "exif_manual" as const, judgedOffStops: 0, confidence: "high" as const } };
    expect(validateEntry(entry({ ...base, indoor: true }))).toEqual([]);
    expect(validateEntry(entry({ ...base, indoor: false }))).toEqual([]);
  });

  it("errors when the ground truth EV is absent", () => {
    expect(codes(entry({ groundTruth: { ev100: null, source: "exif_auto_judged", judgedOffStops: 0, confidence: "medium" } })))
      .toContain("error:ev100_absent");
  });

  it("errors on an auto-judged frame claiming high confidence in a non-zero judgement", () => {
    expect(codes(entry({ groundTruth: { ev100: 12, source: "exif_auto_judged", judgedOffStops: -1, confidence: "high" } })))
      .toContain("error:auto_judged_overconfident");
    // High confidence is fine when nothing was judged…
    expect(validateEntry(entry({ groundTruth: { ev100: 13, source: "exif_auto_judged", judgedOffStops: 0, confidence: "high" } }))).toEqual([]);
    // …and a manually shot frame may be judged off and still be high confidence.
    expect(validateEntry(entry({ groundTruth: { ev100: 12, source: "exif_manual", judgedOffStops: -1, confidence: "high" } }))).toEqual([]);
  });

  it("warns, naming both numbers, when the ground truth is far from the table", () => {
    const reference = LIGHT_CONDITION_EV.overcast;
    const far = entry({ groundTruth: { ev100: reference + EV_GAP_WARN_STOPS + 1, source: "meter", judgedOffStops: 0, confidence: "high" } });
    const issues = validateEntry(far);
    expect(issues).toHaveLength(1);
    expect(issues[0].level).toBe("warning");
    expect(issues[0].code).toBe("ev100_far_from_table");
    expect(issues[0].message).toContain(String(reference + EV_GAP_WARN_STOPS + 1));
    expect(issues[0].message).toContain(String(reference));
    expect(issues[0].message).toContain("overcast");
  });

  it("does not warn at exactly the threshold", () => {
    const atEdge = entry({ groundTruth: { ev100: LIGHT_CONDITION_EV.overcast - EV_GAP_WARN_STOPS, source: "meter", judgedOffStops: 0, confidence: "high" } });
    expect(validateEntry(atEdge)).toEqual([]);
  });
});

describe("stratify", () => {
  const many = (condition: LightConditionId, indoor: boolean, n: number): CorpusDraftEntry[] =>
    Array.from({ length: n }, (_, i) => entry({
      id: `${condition}${i}`,
      condition,
      indoor,
      subjectLit: CONDITION_AXIS[condition] === "subject",
    }));

  it("counts per condition, splits indoor/outdoor and flags thin conditions", () => {
    const strat = stratify([
      ...many("indoor_artificial", true, UNDERPOWERED_N + 2),
      ...many("overcast", false, 3),
    ]);

    expect(strat.total).toBe(UNDERPOWERED_N + 5);
    expect(strat.indoor).toBe(UNDERPOWERED_N + 2);
    expect(strat.outdoor).toBe(3);

    const rows = new Map(strat.perCondition.map((r) => [r.condition, r]));
    expect(rows.get("indoor_artificial")).toEqual({ condition: "indoor_artificial", n: UNDERPOWERED_N + 2, underpowered: false });
    expect(rows.get("overcast")).toEqual({ condition: "overcast", n: 3, underpowered: true });
    // Conditions with no frames at all are still listed, so gaps are visible.
    expect(rows.get("fireworks")).toEqual({ condition: "fireworks", n: 0, underpowered: true });
  });

  it("buckets unlabelled entries separately from the real conditions", () => {
    const strat = stratify([entry({ condition: null, indoor: null })]);
    const unlabelled = strat.perCondition.find((r) => r.condition === "<unlabelled>");
    expect(unlabelled?.n).toBe(1);
    expect(unlabelled?.underpowered).toBe(false);
    expect(strat.unset).toBe(1);
  });
});
