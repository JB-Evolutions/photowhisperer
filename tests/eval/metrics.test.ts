// The two metrics, their stratification and the gate — the parts of mode 2
// that are pure functions and can be pinned without calling the model.
import { describe, expect, it } from "vitest";

import {
  EV_GATE_BLOCK_MEAN,
  EV_GATE_PASS_MEAN,
  HEADLINE_FIXTURE_ID,
  MIN_GATE_N,
  buildStratum,
  gateOutdoor,
  indoorTableCeiling,
  recAbsError,
  settingsEv100,
  stats,
  stratify,
  type Excluded,
  type ScoredEntry,
} from "../../scripts/eval-exposure";
import { loadFixtureManifest } from "./manifestPath";

const entries = loadFixtureManifest();

function scored(over: Partial<ScoredEntry> & Pick<ScoredEntry, "entryId">): ScoredEntry {
  return {
    condition: "direct_sun",
    indoor: false,
    groundTruthEv: 15,
    groundTruthConfidence: "high",
    estimatedEv: 15,
    evAbsError: 0,
    recAbsErrorByFixture: { [HEADLINE_FIXTURE_ID]: 0 },
    modelCondition: "direct_sun",
    verdict: "metered_on_subject",
    verdictOffsetIgnoredStops: 0,
    histogram: { shadowClipPct: 0, highlightClipPct: 0 },
    cached: true,
    ...over,
  };
}

function excludedRow(over: Partial<Excluded> & Pick<Excluded, "entryId">): Excluded {
  return {
    condition: "indoor_dim",
    indoor: true,
    reason: "TIER_3_NO_ESTIMATE",
    detail: null,
    ...over,
  };
}

describe("stats", () => {
  it("reports nothing rather than zero for an empty sample", () => {
    expect(stats([])).toEqual({ n: 0, mean: null, median: null, p90: null, max: null });
  });

  it("averages, medians and takes the nearest-rank p90", () => {
    const s = stats([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(s.n).toBe(10);
    expect(s.mean).toBeCloseTo(5.5, 10);
    expect(s.median).toBeCloseTo(5.5, 10);
    expect(s.p90).toBe(9);
    expect(s.max).toBe(10);
  });

  it("takes the even-length median as the midpoint of the middle pair", () => {
    expect(stats([4, 1, 3, 2]).median).toBeCloseTo(2.5, 10);
  });

  it("does not depend on input order", () => {
    expect(stats([9, 1, 5])).toEqual(stats([1, 5, 9]));
  });
});

describe("recAbsError", () => {
  it("is the plain distance when nothing was declared short", () => {
    expect(recAbsError(12, 10, 0)).toBeCloseTo(2, 10);
  });

  // The subtraction that keeps the harness from arguing against Wave 2's ISO
  // ceiling. A recommendation three stops short that SAYS it is three stops
  // short is correct behaviour and must score zero.
  it("forgives exactly the shortfall the recommendation declares", () => {
    expect(recAbsError(13, 10, 3)).toBeCloseTo(0, 10);
  });

  it("never goes negative when more was declared than delivered", () => {
    expect(recAbsError(11, 10, 3)).toBe(0);
  });

  it("charges only the part beyond the declared shortfall", () => {
    expect(recAbsError(14, 10, 3)).toBeCloseTo(1, 10);
  });
});

describe("settingsEv100", () => {
  it("matches the textbook identity", () => {
    // f/5.6, 1/60, ISO 100 → log2(31.36 × 60) = 10.8777
    expect(settingsEv100({ aperture: 5.6, shutterS: 1 / 60, iso: 100 })).toBeCloseTo(10.8777, 4);
  });

  it("loses a stop for each doubling of ISO", () => {
    const base = settingsEv100({ aperture: 4, shutterS: 1 / 125, iso: 100 });
    expect(settingsEv100({ aperture: 4, shutterS: 1 / 125, iso: 200 })).toBeCloseTo(base - 1, 10);
  });

  it("scores an unknown aperture at the notional f-number the ladder solved at", () => {
    expect(settingsEv100({ aperture: null, shutterS: 1 / 60, iso: 100 })).toBeCloseTo(
      settingsEv100({ aperture: 4, shutterS: 1 / 60, iso: 100 }),
      10
    );
  });
});

describe("stratification", () => {
  it("splits by condition and by indoor/outdoor, and counts exclusions with reasons", () => {
    const strata = stratify(
      [
        scored({ entryId: "a", evAbsError: 0.5 }),
        scored({ entryId: "b", evAbsError: 1.5 }),
        scored({ entryId: "c", condition: "indoor_dim", indoor: true, evAbsError: 3 }),
      ],
      [
        excludedRow({ entryId: "d" }),
        excludedRow({ entryId: "e", reason: "FILE_MISSING" }),
        excludedRow({ entryId: "f", condition: "night_street", indoor: false, reason: "MODEL_ERROR" }),
      ]
    );

    const outdoor = strata.byPlacement.find((s) => s.key === "outdoor");
    const indoor = strata.byPlacement.find((s) => s.key === "indoor");
    expect(outdoor?.n).toBe(2);
    expect(outdoor?.evAbsError.mean).toBeCloseTo(1, 10);
    expect(outdoor?.excluded).toBe(1);
    expect(indoor?.n).toBe(1);
    expect(indoor?.excluded).toBe(2);
    expect(indoor?.exclusionReasons).toEqual({ TIER_3_NO_ESTIMATE: 1, FILE_MISSING: 1 });

    expect(strata.byCondition.map((s) => s.key)).toEqual([
      "direct_sun",
      "indoor_dim",
      "night_street",
    ]);
    expect(strata.overall.n).toBe(3);
    expect(strata.overall.excluded).toBe(3);
  });

  it("quotes recAbsError for the headline gear fixture", () => {
    const stratum = buildStratum(
      "x",
      [
        scored({ entryId: "a", recAbsErrorByFixture: { [HEADLINE_FIXTURE_ID]: 0.4, other: 9 } }),
        scored({ entryId: "b", recAbsErrorByFixture: { [HEADLINE_FIXTURE_ID]: 0.6, other: 9 } }),
      ],
      []
    );
    expect(stratum.recAbsError.mean).toBeCloseTo(0.5, 10);
  });
});

describe("the outdoor-only gate", () => {
  const outdoorRun = (errors: number[]) =>
    errors.map((e, i) => scored({ entryId: `o${i}`, evAbsError: e }));

  it("passes when every gated outdoor stratum is under the pass threshold", () => {
    const gate = gateOutdoor(outdoorRun([0.2, 0.4, 0.6]), []);
    expect(gate.status).toBe("pass");
    expect(gate.gatedStrata).toContain("outdoor");
  });

  it("warns in the band between pass and block", () => {
    const gate = gateOutdoor(outdoorRun([1.0, 1.2, 1.4]), []);
    expect(gate.status).toBe("warn");
    expect(gate.reasons.join(" ")).toContain("warning band");
  });

  it("blocks at or above the block threshold", () => {
    const gate = gateOutdoor(outdoorRun([1.5, 1.5, 1.5]), []);
    expect(gate.status).toBe("block");
  });

  it("refuses to gate on a stratum smaller than the minimum", () => {
    const gate = gateOutdoor(outdoorRun(Array(MIN_GATE_N - 1).fill(9)), []);
    expect(gate.status).toBe("insufficient_data");
    expect(gate.gatedStrata).toEqual([]);
  });

  // Indoor is the open question, not a regression to enforce. However bad it
  // looks, it must be unable to change the verdict.
  it("ignores indoor entries entirely, however bad they are", () => {
    const indoorDisaster = Array.from({ length: 8 }, (_, i) =>
      scored({ entryId: `i${i}`, condition: "indoor_dim", indoor: true, evAbsError: 6 })
    );
    const withIndoor = gateOutdoor([...outdoorRun([0.2, 0.4, 0.6]), ...indoorDisaster], [
      excludedRow({ entryId: "x" }),
    ]);
    const withoutIndoor = gateOutdoor(outdoorRun([0.2, 0.4, 0.6]), []);
    expect(withIndoor.status).toBe("pass");
    expect(withIndoor).toEqual(withoutIndoor);
  });

  it("uses the documented thresholds", () => {
    expect(EV_GATE_PASS_MEAN).toBe(1.0);
    expect(EV_GATE_BLOCK_MEAN).toBe(1.5);
  });
});

describe("indoor table ceiling", () => {
  it("scores LIGHT_CONDITION_EV against measured ground truth for indoor entries only", () => {
    const { rows, stats: s } = indoorTableCeiling(entries);
    expect(rows).toHaveLength(entries.filter((e) => e.indoor).length);
    expect(rows.every((r) => r.absError >= 0)).toBe(true);
    expect(s.n).toBe(rows.length);

    // candlelit is the table's worst indoor case in this manifest: EV 4 against
    // a measured 0.61. Surfacing that is the point of the diagnostic.
    const candlelit = rows.find((r) => r.condition === "candlelit");
    expect(candlelit?.tableEv).toBe(4);
    expect(candlelit?.absError).toBeGreaterThan(3);
  });
});
