import { describe, it, expect, afterAll } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { mergeEntries, refreshEntry, exifBlockFrom, scanDirectory, type ScannedImage } from "../ingest";
import { MANIFEST_VERSION, type CorpusDraftEntry, type CorpusManifest } from "../manifest";

function scan(over: Partial<ScannedImage> & { id: string }): ScannedImage {
  return {
    file: `${over.id}.jpg`,
    capturedAt: "2026-03-01T10:00:00.000Z",
    ...over,
    exif: {
      present: true,
      iso: 100,
      apertureN: 8,
      shutterSec: 1 / 128,
      exposureBiasEv: 0,
      meteringMode: "pattern",
      make: "FUJIFILM",
      model: "X-T5",
      ...over.exif,
    },
  };
}

function manifestOf(entries: CorpusDraftEntry[]): CorpusManifest {
  return {
    version: MANIFEST_VERSION,
    generatedAt: "2026-03-01T00:00:00.000Z",
    root: "corpus",
    entries,
    needs_labels: [],
  };
}

describe("mergeEntries on a fresh folder", () => {
  it("derives ev100 from the settings and leaves the human fields unset", () => {
    const { entries } = mergeEntries(null, [scan({ id: "aaaaaaaaaaaa" })]);
    expect(entries).toHaveLength(1);
    const e = entries[0];
    expect(e.groundTruth).toEqual({
      ev100: 13,
      source: "exif_auto_judged",
      judgedOffStops: 0,
      confidence: "medium",
    });
    expect(e.condition).toBeNull();
    expect(e.indoor).toBeNull();
    expect(e.subjectLit).toBeNull();
    expect(e.notes).toBeNull();
  });

  it("sends frames with no exposure EXIF to needs_labels with a null ev100", () => {
    const { entries, needs_labels } = mergeEntries(null, [
      scan({ id: "aaaaaaaaaaaa" }),
      scan({ id: "bbbbbbbbbbbb", exif: { present: false, iso: null, apertureN: null, shutterSec: null, exposureBiasEv: null, meteringMode: null, make: null, model: null } }),
      scan({ id: "cccccccccccc", exif: { present: true, iso: null, apertureN: 8, shutterSec: 1 / 128, exposureBiasEv: null, meteringMode: null, make: null, model: null } }),
    ]);
    expect(needs_labels.map((n) => n.id).sort()).toEqual(["bbbbbbbbbbbb", "cccccccccccc"]);
    expect(needs_labels.every((n) => n.reason === "no_exposure_exif")).toBe(true);
    expect(entries.find((e) => e.id === "bbbbbbbbbbbb")?.groundTruth.ev100).toBeNull();
    expect(entries.find((e) => e.id === "aaaaaaaaaaaa")?.groundTruth.ev100).toBe(13);
  });
});

describe("exposureBiasEv is recorded but never added", () => {
  // Bias is already baked into the taken aperture/shutter/ISO. Adding it again
  // would double-count it, so the same settings must yield the same ev100
  // whether the tag says -1 or is missing entirely.
  it("yields the same ev100 for exposureBiasEv -1 as for null", () => {
    const biased = mergeEntries(null, [scan({ id: "aaaaaaaaaaaa", exif: { exposureBiasEv: -1 } as ScannedImage["exif"] })]);
    const unbiased = mergeEntries(null, [scan({ id: "aaaaaaaaaaaa", exif: { exposureBiasEv: null } as ScannedImage["exif"] })]);

    expect(biased.entries[0].groundTruth.ev100).toBe(13);
    expect(unbiased.entries[0].groundTruth.ev100).toBe(13);
    expect(biased.entries[0].groundTruth.ev100).toBe(unbiased.entries[0].groundTruth.ev100);

    // …and it is still on the entry, for audit.
    expect(biased.entries[0].exif.exposureBiasEv).toBe(-1);
    expect(unbiased.entries[0].exif.exposureBiasEv).toBeNull();
  });
});

describe("mergeEntries never destroys labelling work", () => {
  const labelled: CorpusDraftEntry = {
    id: "aaaaaaaaaaaa",
    file: "day1/DSCF0001.jpg",
    capturedAt: "2026-03-01T10:00:00.000Z",
    condition: "stage_lit",
    indoor: true,
    subjectLit: true,
    groundTruth: { ev100: 12, source: "exif_auto_judged", judgedOffStops: -1, confidence: "medium" },
    exif: {
      present: true, iso: 100, apertureN: 8, shutterSec: 1 / 128,
      exposureBiasEv: 0, meteringMode: "pattern", make: "FUJIFILM", model: "X-T5",
    },
    notes: "front row, spill from the house lights",
  };

  it("preserves every human field and refreshes only the EXIF block", () => {
    const rescanned = scan({
      id: "aaaaaaaaaaaa",
      file: "day1/DSCF0001.jpg",
      exif: { meteringMode: "spot", model: "X-T5 II" } as ScannedImage["exif"],
    });
    const { entries, refreshed, added } = mergeEntries(manifestOf([labelled]), [rescanned]);

    expect(added).toEqual([]);
    expect(refreshed).toEqual(["aaaaaaaaaaaa"]);
    const e = entries[0];
    expect(e.condition).toBe("stage_lit");
    expect(e.indoor).toBe(true);
    expect(e.subjectLit).toBe(true);
    expect(e.notes).toBe("front row, spill from the house lights");
    expect(e.groundTruth.judgedOffStops).toBe(-1);
    expect(e.groundTruth.source).toBe("exif_auto_judged");
    expect(e.groundTruth.confidence).toBe("medium");
    expect(e.exif.meteringMode).toBe("spot");
    expect(e.exif.model).toBe("X-T5 II");
  });

  it("recomputes a derived ev100 from refreshed EXIF, keeping the human judgement", () => {
    // Same frame re-read at ISO 200 — one stop less settings EV, and the
    // human's -1 judgement rides along.
    const rescanned = scan({ id: "aaaaaaaaaaaa", exif: { iso: 200 } as ScannedImage["exif"] });
    const { entries } = mergeEntries(manifestOf([labelled]), [rescanned]);
    expect(entries[0].groundTruth.ev100).toBe(11);
    expect(entries[0].groundTruth.judgedOffStops).toBe(-1);
  });

  it("leaves a hand-entered ev100 alone when the source is meter or exif_manual", () => {
    for (const source of ["meter", "exif_manual"] as const) {
      const handEntered: CorpusDraftEntry = {
        ...labelled,
        groundTruth: { ev100: -2.5, source, judgedOffStops: 0, confidence: "high" },
      };
      const rescanned = scan({ id: "aaaaaaaaaaaa", exif: { iso: 6400 } as ScannedImage["exif"] });
      const { entries } = mergeEntries(manifestOf([handEntered]), [rescanned]);
      expect(entries[0].groundTruth.ev100).toBe(-2.5);
      expect(entries[0].groundTruth.source).toBe(source);
      expect(entries[0].exif.iso).toBe(6400);
    }
  });

  it("keeps a labelled entry whose file was not in this scan rather than dropping it", () => {
    const { entries, missing } = mergeEntries(manifestOf([labelled]), [scan({ id: "bbbbbbbbbbbb" })]);
    expect(missing).toEqual(["aaaaaaaaaaaa"]);
    expect(entries).toHaveLength(2);
    expect(entries.find((e) => e.id === "aaaaaaaaaaaa")?.condition).toBe("stage_lit");
  });

  it("survives repeated ingests unchanged", () => {
    const first = mergeEntries(manifestOf([labelled]), [scan({ id: "aaaaaaaaaaaa", file: "day1/DSCF0001.jpg" })]);
    const second = mergeEntries(manifestOf(first.entries), [scan({ id: "aaaaaaaaaaaa", file: "day1/DSCF0001.jpg" })]);
    expect(second.entries).toEqual(first.entries);
  });

  it("follows a renamed file while keeping its labels, because identity is the byte hash", () => {
    const { entries } = mergeEntries(manifestOf([labelled]), [
      scan({ id: "aaaaaaaaaaaa", file: "day1/keepers/DSCF0001.jpg" }),
    ]);
    expect(entries[0].file).toBe("day1/keepers/DSCF0001.jpg");
    expect(entries[0].condition).toBe("stage_lit");
  });
});

describe("refreshEntry", () => {
  it("nulls a derived ev100 when the refreshed EXIF can no longer support one", () => {
    const entry: CorpusDraftEntry = {
      id: "aaaaaaaaaaaa", file: "a.jpg", capturedAt: null,
      condition: "overcast", indoor: false, subjectLit: false,
      groundTruth: { ev100: 13, source: "exif_auto_judged", judgedOffStops: 0, confidence: "medium" },
      exif: { present: true, iso: 100, apertureN: 8, shutterSec: 1 / 128, exposureBiasEv: 0, meteringMode: null, make: null, model: null },
      notes: null,
    };
    const stripped = scan({ id: "aaaaaaaaaaaa", exif: { present: false, iso: null, apertureN: null, shutterSec: null, exposureBiasEv: null, meteringMode: null, make: null, model: null } });
    expect(refreshEntry(entry, stripped).groundTruth.ev100).toBeNull();
    expect(refreshEntry(entry, stripped).condition).toBe("overcast");
  });
});

describe("exifBlockFrom", () => {
  it("marks an unreadable file absent without inventing values", () => {
    expect(exifBlockFrom(null)).toEqual({
      present: false, iso: null, apertureN: null, shutterSec: null,
      exposureBiasEv: null, meteringMode: null, make: null, model: null,
    });
  });

  it("names the numeric metering mode and reads exifr's ExposureCompensation", () => {
    const block = exifBlockFrom({
      FNumber: 1.8, ExposureTime: 0.05, ISO: 3200, MeteringMode: 3,
      ExposureCompensation: -0.667, Make: " Apple ", Model: "iPhone 17 Pro",
    });
    expect(block).toEqual({
      present: true, iso: 3200, apertureN: 1.8, shutterSec: 0.05,
      exposureBiasEv: -0.667, meteringMode: "spot", make: "Apple", model: "iPhone 17 Pro",
    });
  });

  it("takes the first entry of a multi-valued ISOSpeedRatings tag", () => {
    expect(exifBlockFrom({ ISOSpeedRatings: [800, 0, 0] }).iso).toBe(800);
  });

  it("keeps a zero exposure bias distinct from an absent one", () => {
    expect(exifBlockFrom({ ExposureCompensation: 0 }).exposureBiasEv).toBe(0);
    expect(exifBlockFrom({ FNumber: 8 }).exposureBiasEv).toBeNull();
  });
});

describe("scanDirectory", () => {
  const tmpDirs: string[] = [];
  afterAll(async () => {
    await Promise.all(tmpDirs.map((d) => rm(d, { recursive: true, force: true })));
  });

  it("hashes bytes, walks subfolders and dedupes identical files", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "corpus-scan-"));
    tmpDirs.push(dir);
    await mkdir(path.join(dir, "day2"), { recursive: true });
    await writeFile(path.join(dir, "a.jpg"), "identical-bytes");
    await writeFile(path.join(dir, "day2", "b.jpg"), "identical-bytes");
    await writeFile(path.join(dir, "day2", "c.jpg"), "different-bytes");
    await writeFile(path.join(dir, "notes.txt"), "not an image");

    const { scanned, duplicates } = await scanDirectory(dir);

    expect(scanned.map((s) => s.file).sort()).toEqual(["a.jpg", path.join("day2", "c.jpg")]);
    expect(duplicates).toHaveLength(1);
    expect(duplicates[0].file).toBe(path.join("day2", "b.jpg"));
    expect(duplicates[0].duplicateOf).toBe("a.jpg");
    expect(scanned[0].id).toHaveLength(12);
    expect(scanned[0].exif.present).toBe(false);
  });
});
