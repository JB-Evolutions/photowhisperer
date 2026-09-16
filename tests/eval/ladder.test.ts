// Mode 1 of the eval harness, run as part of the ordinary vitest suite: no
// network, no API key, no photos on disk. Ground-truth EV goes straight into
// solveExposure() and the recommended triple is checked back against the EV it
// was solved for.
//
// Mode 2 is deliberately absent from this file — it calls the model, costs
// money and is non-deterministic, so it never runs in the suite.
import { describe, expect, it } from "vitest";

import { DEFAULT_ISO_CEILING, effectiveIsoCeiling, type BodyProfile } from "@/lib/contract/types";
import { roundToCameraSteps } from "@/calculator/round";
import { solveExposure } from "@/calculator/ladder";

import {
  GEAR_FIXTURES,
  MAX_ROUNDING_GAIN_STOPS,
  LADDER_FOCAL_MM,
  LADDER_INTENT,
  LADDER_MOTION,
  LADDER_SUPPORT,
  checkLadderRun,
  gearFixture,
  ladderFinding,
  roundForFixture,
  runLadder,
  runLadderSweep,
  settingsEv100,
} from "../../scripts/eval-exposure";
import { loadFixtureManifest } from "./manifestPath";

const entries = loadFixtureManifest();

const entryById = (id: string) => {
  const found = entries.find((e) => e.id === id);
  if (!found) throw new Error(`fixture manifest has no entry ${id}`);
  return found;
};

describe("ladder sweep over the fixture manifest", () => {
  it("covers every entry against every gear fixture", () => {
    const { runs } = runLadderSweep(entries);
    expect(entries).toHaveLength(12);
    expect(runs).toHaveLength(entries.length * GEAR_FIXTURES.length);
  });

  it("recommends an exposure-correct triple everywhere", () => {
    const { violations } = runLadderSweep(entries);
    expect(violations).toEqual([]);
  });

  it("never returns a shutter slower than the floor it reports", () => {
    for (const run of runLadderSweep(entries).runs) {
      expect(run.rounded.shutterS).toBeLessThanOrEqual(run.raw.floor.floorS * (1 + 1e-9));
    }
  });
});

describe("effectiveIsoCeiling is the only ceiling in play", () => {
  // The same dark frame across (c), (d) and (e), which differ only in what
  // the body says about ISO. Three different answers is the proof that the
  // ceiling flows from the body and nowhere else.
  const darkEntry = () => entryById("fx-night-moonlit-field");

  it("gives an auto-ISO body the contract default", () => {
    const run = runLadder(darkEntry(), gearFixture("zoom_f56_auto"));
    expect(run.ceilingBound).toBe(true);
    expect(run.isoCeiling).toBe(DEFAULT_ISO_CEILING);
    expect(run.rounded.iso).toBe(DEFAULT_ISO_CEILING);
  });

  it("holds a capped body to its stated cap", () => {
    const run = runLadder(darkEntry(), gearFixture("zoom_f56_iso1600"));
    expect(run.ceilingBound).toBe(true);
    expect(run.rounded.iso).toBe(1600);
  });

  it("gives a body declaring isoMax 12800 its own value, not the default", () => {
    const run = runLadder(darkEntry(), gearFixture("zoom_f56_iso12800"));
    expect(run.ceilingBound).toBe(true);
    expect(run.rounded.iso).toBe(12800);
    expect(run.rounded.iso).not.toBe(DEFAULT_ISO_CEILING);
  });

  it("produces three different ISOs for the same frame and lens", () => {
    const isos = (["zoom_f56_auto", "zoom_f56_iso1600", "zoom_f56_iso12800"] as const).map(
      (id) => runLadder(darkEntry(), gearFixture(id)).rounded.iso
    );
    expect(new Set(isos).size).toBe(3);
  });

  // Guards the harness itself rather than the solver. A body whose base ISO
  // sits above its own cap is the one shape where roundToCameraSteps's
  // ceiling still has work to do after the ladder has finished — so if
  // roundForFixture ever stopped passing effectiveIsoCeiling (or passed
  // Infinity, or DEFAULT_ISO_CEILING), this is where it shows.
  it("rounds against the body's ceiling, not an absent one", () => {
    const probeBody: BodyProfile = {
      label: "base above its own cap",
      cropFactor: 1,
      ibisStops: null,
      isoBase: 3200,
      isoMode: "capped",
      isoValue: null,
      isoMax: 1600,
    };
    expect(effectiveIsoCeiling(probeBody)).toBe(1600);

    const raw = solveExposure({
      sceneEv: darkEntry().groundTruth.ev100,
      intent: LADDER_INTENT,
      focalMm: LADDER_FOCAL_MM,
      body: probeBody,
      lens: gearFixture("zoom_f56_auto").lens,
      motion: LADDER_MOTION,
      support: LADDER_SUPPORT,
    });

    const withCeiling = roundForFixture(raw, { body: probeBody });
    const withoutCeiling = roundToCameraSteps(raw, Infinity);

    expect(withCeiling.iso).toBe(1600);
    expect(withoutCeiling.iso).toBe(3200);
    expect(withCeiling.iso).not.toBe(withoutCeiling.iso);
  });
});

describe("declared shortfall", () => {
  // The identity mode 1 exists to assert, stated in the direction that
  // matters: a triple is never short by more than it declares. The one
  // exception is the runs the sweep itself flags, and there the excess is
  // capped by a bound derived from the run, not a tolerance chosen here.
  it("accounts for every stop the triple is short of the scene", () => {
    for (const run of runLadderSweep(entries).runs) {
      const where = `${run.entryId}/${run.fixtureId}`;
      const fixture = gearFixture(run.fixtureId);
      const gap = settingsEv100(run.rounded) - run.targetEv;
      const undeclared = gap - run.rounded.shortfallStops;
      const finding = ladderFinding(run, fixture);

      if (finding === null) {
        expect(undeclared, where).toBeLessThanOrEqual(1e-6);
      } else {
        expect(undeclared, where).toBeGreaterThan(0);
        expect(undeclared, where).toBeLessThanOrEqual(finding.boundStops);
      }

      // The other direction is bounded too. Of the three camera grids only
      // ISO rounds in the light-gaining direction, and only to the next step
      // up, so a triple can never quietly overexpose by more than one of
      // those steps is worth.
      expect(undeclared, where).toBeGreaterThanOrEqual(-MAX_ROUNDING_GAIN_STOPS);
    }
  });

  // The regression the secondary metric exists to avoid: a night frame where
  // the ISO ceiling binds is DELIBERATELY several stops short and says so.
  // Scored without subtracting the declared shortfall it looks like a large
  // failure, and the harness starts arguing for removing the ceiling.
  it("is subtracted out of recAbsError on a ceiling-bound night frame", () => {
    const run = runLadder(entryById("fx-night-moonlit-field"), gearFixture("zoom_f56_auto"));
    expect(run.rounded.shortfallStops).toBeGreaterThan(3);
    expect(Math.abs(run.deliveredShortfallStops)).toBeGreaterThan(3);
    expect(run.recAbsError).toBeCloseTo(0, 6);
  });

  // A bright frame has light to spare, so nothing is short for want of it.
  // What remains is camera-step rounding: the shutter grid rounds FASTER, and
  // that loss is declared rather than hidden. It can never exceed the third
  // of a stop between adjacent steps.
  it("on a frame with light to spare is nothing but declared step rounding", () => {
    const run = runLadder(entryById("fx-daylight-direct-sun-park"), gearFixture("zoom_f56_auto"));
    expect(run.raw.shortfallStops).toBe(0);
    expect(run.rounded.shortfallStops).toBeGreaterThan(0);
    expect(run.rounded.shortfallStops).toBeLessThanOrEqual(1 / 3 + 1e-9);
    expect(run.recAbsError).toBeCloseTo(0, 6);
  });
});

// The sweep found this rather than being told about it: in the too-bright
// branch, ladder.ts rounds the stopped-down aperture narrower to a tenth of a
// stop for display honesty and still returns shortfallStops: 0, so the triple
// is fractionally underexposed without saying so. It is reported as a finding
// and never gated — src/ is not this harness's to change.
describe("undeclared aperture rounding", () => {
  const sunOnAFastPrime = () =>
    runLadder(entryById("fx-daylight-direct-sun-park"), gearFixture("prime_f18_auto"));

  it("is reported where the solver stops a fast lens down past its widest", () => {
    const run = sunOnAFastPrime();
    const fixture = gearFixture("prime_f18_auto");
    expect(run.raw.shortfallStops).toBe(0);
    expect(run.raw.aperture).toBeGreaterThan(fixture.lens.aperWide!);

    const finding = ladderFinding(run, fixture);
    expect(finding).not.toBeNull();
    expect(finding!.kind).toBe("LADDER_UNDECLARED_APERTURE_ROUNDING");
    expect(finding!.entryId).toBe("fx-daylight-direct-sun-park");
    expect(finding!.undeclaredStops).toBeGreaterThan(0);
  });

  it("is within the light a tenth-of-a-stop narrowing can account for", () => {
    const fixture = gearFixture("prime_f18_auto");
    const finding = ladderFinding(sunOnAFastPrime(), fixture)!;
    // The exact aperture the solver rounded from lies in (a - 0.1, a].
    const bound = 2 * Math.log2(finding.solverAperture / (finding.solverAperture - 0.1));
    expect(finding.boundStops).toBeCloseTo(bound, 10);
    expect(finding.undeclaredStops).toBeLessThanOrEqual(finding.boundStops);
  });

  it("is not raised on a run whose aperture the solver never stopped down", () => {
    expect(ladderFinding(sunOnAFastPrime(), gearFixture("prime_f18_auto"))).not.toBeNull();
    expect(
      ladderFinding(
        runLadder(entryById("fx-night-moonlit-field"), gearFixture("zoom_f56_auto")),
        gearFixture("zoom_f56_auto")
      )
    ).toBeNull();
  });

  it("is reported, not gated: the sweep still passes", () => {
    const { violations, findings } = runLadderSweep(entries);
    expect(findings.length).toBeGreaterThan(0);
    expect(violations).toEqual([]);
  });
});

describe("checkLadderRun", () => {
  it("catches a triple that is short without declaring it", () => {
    const run = runLadder(entryById("fx-candlelit-table"), gearFixture("zoom_f56_auto"));
    const tampered = {
      ...run,
      rounded: { ...run.rounded, shortfallStops: 0 },
    };
    const violations = checkLadderRun(tampered, gearFixture("zoom_f56_auto"));
    expect(violations.join("\n")).toContain("declares no shortfall");
  });

  it("catches an ISO above the body's ceiling", () => {
    const fixture = gearFixture("zoom_f56_iso1600");
    const run = runLadder(entryById("fx-candlelit-table"), fixture);
    const tampered = { ...run, rounded: { ...run.rounded, iso: 6400 } };
    expect(checkLadderRun(tampered, fixture).join("\n")).toContain("exceeds this body's ceiling");
  });

  it("catches a shutter slower than the floor", () => {
    const fixture = gearFixture("zoom_f56_auto");
    const run = runLadder(entryById("fx-indoor-dim-livingroom"), fixture);
    const tampered = { ...run, rounded: { ...run.rounded, shutterS: 1 } };
    expect(checkLadderRun(tampered, fixture).join("\n")).toContain("slower than the");
  });
});
