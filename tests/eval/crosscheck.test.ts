// The EV pipeline cross-check. This is a reporting instrument, not a fix: it
// compares the production scene_ev against an independently derived
// settingsEv100 and names every disagreement. Nothing here reconciles them.
import { describe, expect, it } from "vitest";

import {
  DISAGREEMENT_TOLERANCE_STOPS,
  SYNTHETIC_CORPUS_CAVEAT,
  crossCheck,
  crossCheckEntry,
  provenance,
} from "../../scripts/eval-exposure";
import { FIXTURE_MANIFEST_PATH, loadFixtureManifest } from "./manifestPath";

const entries = loadFixtureManifest();
const byId = (id: string) => {
  const found = entries.find((e) => e.id === id);
  if (!found) throw new Error(`fixture manifest has no entry ${id}`);
  return found;
};

describe("crossCheckEntry", () => {
  it("has nothing to compare when the frame carries no EXIF", () => {
    expect(crossCheckEntry(byId("fx-night-street-noexif"))).toBeNull();
  });

  it("stays quiet when the two paths agree", () => {
    // Zero exposure bias: evFromExif + 0 is the derived formula, so the two
    // paths are the same number and there is no finding to make.
    expect(crossCheckEntry(byId("fx-indoor-dim-livingroom"))).toBeNull();
    expect(crossCheckEntry(byId("fx-daylight-direct-sun-park"))).toBeNull();
  });

  it("names both numbers and the entry when they disagree", () => {
    const finding = crossCheckEntry(byId("fx-moon-subject-telephoto"));
    expect(finding).not.toBeNull();
    expect(finding!.kind).toBe("EV_PIPELINE_DISAGREEMENT");
    expect(finding!.entryId).toBe("fx-moon-subject-telephoto");
    expect(finding!.productionSceneEv).toBeTypeOf("number");
    expect(finding!.settingsEv100).toBeTypeOf("number");
    expect(finding!.differenceStops).toBeCloseTo(
      finding!.productionSceneEv - finding!.settingsEv100,
      10
    );
  });

  // The substance of the finding, stated as a fact rather than resolved: the
  // closed decision is scene_ev = evFromExif(exif) + exposureBiasEv, and
  // evFromExif IS the derived formula, so the gap the harness measures is
  // exactly the bias the camera dialled in. Whether that composition is right
  // is the question this hands back, not one the harness answers.
  it("measures a gap of exactly the frame's exposure bias", () => {
    for (const finding of crossCheck(entries)) {
      expect(finding.differenceStops).toBeCloseTo(finding.exposureBiasEv, 6);
    }
  });

  it("reports both pipelines' distance from ground truth without picking one", () => {
    const finding = crossCheckEntry(byId("fx-daylight-hazy-sun-coast"))!;
    expect(finding.productionAbsError).toBeGreaterThanOrEqual(0);
    expect(finding.settingsAbsError).toBeGreaterThanOrEqual(0);
    // The manifest's ground truth is settingsEv100 + judgedOffStops, and here
    // judgedOffStops equals the bias, so the production path lands on it.
    expect(finding.productionAbsError).toBeLessThan(finding.settingsAbsError);
    expect(finding).not.toHaveProperty("winner");
    expect(finding).not.toHaveProperty("fix");
  });

  it("ignores a disagreement inside the reporting tolerance", () => {
    const base = byId("fx-daylight-direct-sun-park");
    const nudged = {
      ...base,
      exif: { ...base.exif, exposureBiasEv: DISAGREEMENT_TOLERANCE_STOPS / 2 },
    };
    expect(crossCheckEntry(nudged)).toBeNull();

    const beyond = {
      ...base,
      exif: { ...base.exif, exposureBiasEv: DISAGREEMENT_TOLERANCE_STOPS * 10 },
    };
    expect(crossCheckEntry(beyond)).not.toBeNull();
  });
});

describe("crossCheck over the fixture manifest", () => {
  it("fires once per biased frame and on no others", () => {
    const findings = crossCheck(entries);
    const biased = entries.filter(
      (e) => e.exif.present && (e.exif.exposureBiasEv ?? 0) !== 0
    );
    expect(findings.map((f) => f.entryId).sort()).toEqual(biased.map((e) => e.id).sort());
    expect(findings).toHaveLength(5);
  });

  it("emits every disagreement as its own finding rather than an aggregate", () => {
    const findings = crossCheck(entries);
    expect(new Set(findings.map((f) => f.entryId)).size).toBe(findings.length);
    expect(findings.every((f) => f.kind === "EV_PIPELINE_DISAGREEMENT")).toBe(true);
  });
});

// The cross-check above and the indoor table ceiling are the two outputs that
// read as evidence. On authored fixtures they are not evidence — the EXIF and
// the ground truth were written together, so of course they agree. The caveat
// has to travel with the report, because the number is what gets quoted.
describe("provenance", () => {
  const metered = () => [
    { ...entries[0], groundTruth: { ...entries[0].groundTruth, source: "meter" as const } },
  ];

  it("flags the synthetic fixture set by its path, whatever its entries claim", () => {
    // The fixtures do contain metered entries, so path alone must be enough.
    expect(entries.some((e) => e.groundTruth.source === "meter")).toBe(true);

    const p = provenance(FIXTURE_MANIFEST_PATH, entries);
    expect(p.synthetic).toBe(true);
    expect(p.caveat).toBe(SYNTHETIC_CORPUS_CAVEAT);
    expect(p.reasons.join(" ")).toContain("fixture set");
  });

  it("flags any corpus whose ground truth was never metered", () => {
    const unmetered = entries.map((e) => ({
      ...e,
      groundTruth: { ...e.groundTruth, source: "exif_manual" as const },
    }));
    const p = provenance("/srv/corpus/manifest.json", unmetered);
    expect(p.synthetic).toBe(true);
    expect(p.reasons.join(" ")).toContain("meter");
  });

  it("stays silent on a real corpus with metered ground truth", () => {
    const p = provenance("/srv/corpus/manifest.json", metered());
    expect(p.synthetic).toBe(false);
    expect(p.caveat).toBeNull();
    expect(p.reasons).toEqual([]);
  });

  it("names the wording the report has to carry verbatim", () => {
    expect(SYNTHETIC_CORPUS_CAVEAT).toContain("SYNTHETIC CORPUS");
    expect(SYNTHETIC_CORPUS_CAVEAT).toContain("fixture authorship, not validation");
    expect(SYNTHETIC_CORPUS_CAVEAT).toContain("EV_PIPELINE_DISAGREEMENT");
    expect(SYNTHETIC_CORPUS_CAVEAT).toContain("indoor table-ceiling");
    expect(SYNTHETIC_CORPUS_CAVEAT).toContain("human-judged ground truth");
  });

  // An empty manifest produced no numbers, so there is nothing to caveat. The
  // report says 0 scored either way.
  it("has nothing to caveat when there are no entries at all", () => {
    expect(provenance("/srv/corpus/manifest.json", []).synthetic).toBe(false);
  });
});
