// parseManifest — the only thing standing between a hand-maintained JSON file
// and a run that silently scores the wrong numbers. Every field is proved to
// be checked, because a corpus entry that parses loosely produces a metric
// that reads precisely.
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { parseManifest } from "../../scripts/eval-exposure";
import { FIXTURE_MANIFEST_PATH, loadFixtureManifest } from "./manifestPath";

const rawManifest = (): unknown[] =>
  JSON.parse(readFileSync(FIXTURE_MANIFEST_PATH, "utf8")) as unknown[];

/** The fixture manifest with one entry's field replaced, as untyped JSON. */
function mutated(index: number, patch: Record<string, unknown>): unknown[] {
  const raw = rawManifest();
  raw[index] = { ...(raw[index] as Record<string, unknown>), ...patch };
  return raw;
}

function nested(index: number, key: "groundTruth" | "exif", patch: Record<string, unknown>): unknown[] {
  const raw = rawManifest();
  const entry = raw[index] as Record<string, unknown>;
  raw[index] = { ...entry, [key]: { ...(entry[key] as Record<string, unknown>), ...patch } };
  return raw;
}

describe("the fixture manifest itself", () => {
  const entries = loadFixtureManifest();

  it("has the twelve entries the harness is specified against", () => {
    expect(entries).toHaveLength(12);
    expect(new Set(entries.map((e) => e.id)).size).toBe(12);
  });

  it("covers every condition the brief calls for", () => {
    const counts = entries.reduce<Record<string, number>>((acc, e) => {
      acc[e.condition] = (acc[e.condition] ?? 0) + 1;
      return acc;
    }, {});
    expect(counts.indoor_dim).toBe(2);
    expect(counts.indoor_artificial).toBe(2);
    expect(counts.candlelit).toBe(1);
    expect(counts.moon_subject).toBe(1);
    expect(counts.stage_lit).toBe(1);
    expect(counts.neon_signage).toBe(1);
    expect(counts.night_moonlit).toBe(1);
    expect(entries.filter((e) => e.exif.present === false)).toHaveLength(1);
  });

  it("has enough outdoor entries on both sides to exercise the gate and the indoor report", () => {
    expect(entries.filter((e) => !e.indoor).length).toBeGreaterThanOrEqual(3);
    expect(entries.filter((e) => e.indoor).length).toBeGreaterThanOrEqual(3);
  });

  // The fixtures are only useful if the arithmetic inside them is real. Ground
  // truth is the frame's own settings EV plus how far off that exposure was
  // judged to be (signed: -1 means one stop under).
  it("is internally coherent: ev100 = settingsEv100 + judgedOffStops", () => {
    for (const e of entries) {
      if (!e.exif.present) continue;
      const { apertureN, shutterSec, iso } = e.exif;
      expect(apertureN, e.id).not.toBeNull();
      const settings =
        Math.log2((apertureN! * apertureN!) / shutterSec!) - Math.log2(iso! / 100);
      expect(settings + e.groundTruth.judgedOffStops, e.id).toBeCloseTo(e.groundTruth.ev100, 2);
    }
  });

  it("carries no image files, so both modes are testable before the corpus exists", () => {
    expect(entries.every((e) => typeof e.file === "string" && e.file.length > 0)).toBe(true);
  });
});

describe("parseManifest rejections", () => {
  it("requires an array at the root", () => {
    expect(() => parseManifest({})).toThrow(/must be an array/);
  });

  it("rejects a duplicate id", () => {
    const raw = rawManifest();
    raw.push({ ...(raw[0] as Record<string, unknown>) });
    expect(() => parseManifest(raw)).toThrow(/duplicate id/);
  });

  it("rejects a condition that is not in the contract's table", () => {
    expect(() => parseManifest(mutated(0, { condition: "golden_hour_ish" }))).toThrow(
      /not a known light condition/
    );
  });

  it("rejects an unknown ground-truth source", () => {
    expect(() => parseManifest(nested(0, "groundTruth", { source: "vibes" }))).toThrow(
      /groundTruth\.source/
    );
  });

  it("rejects an unknown confidence", () => {
    expect(() => parseManifest(nested(0, "groundTruth", { confidence: "quite" }))).toThrow(
      /groundTruth\.confidence/
    );
  });

  it("rejects a non-numeric ev100", () => {
    expect(() => parseManifest(nested(0, "groundTruth", { ev100: "12" }))).toThrow(
      /groundTruth\.ev100 must be a finite number/
    );
  });

  // A missing judgedOffStops must not quietly become zero: that silently
  // rewrites ground truth to the frame's own settings.
  it("rejects a missing judgedOffStops rather than defaulting it", () => {
    const raw = rawManifest();
    const entry = raw[0] as Record<string, unknown>;
    const gt = { ...(entry.groundTruth as Record<string, unknown>) };
    delete gt.judgedOffStops;
    raw[0] = { ...entry, groundTruth: gt };
    expect(() => parseManifest(raw)).toThrow(/judgedOffStops/);
  });

  it("rejects a non-boolean indoor flag", () => {
    expect(() => parseManifest(mutated(0, { indoor: "yes" }))).toThrow(/indoor must be a boolean/);
  });

  it("rejects a non-boolean exif.present", () => {
    expect(() => parseManifest(nested(0, "exif", { present: 1 }))).toThrow(
      /exif\.present must be a boolean/
    );
  });

  it("names the offending entry by id", () => {
    expect(() => parseManifest(mutated(3, { condition: "nonsense" }))).toThrow(
      /fx-indoor-artificial-office/
    );
  });

  it("keeps nullable fields nullable", () => {
    const parsed = parseManifest(
      mutated(0, { capturedAt: null, notes: null })
    );
    expect(parsed[0].capturedAt).toBeNull();
    expect(parsed[0].notes).toBeNull();
  });
});
