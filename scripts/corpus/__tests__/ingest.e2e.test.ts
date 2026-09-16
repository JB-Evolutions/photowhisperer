// End-to-end over real bytes: hashing, the exifr read with the app's own
// EXIFR_OPTIONS, and the EV derivation. This is the layer the hand-written tag
// objects in ingest.test.ts cannot cover — if exifr's field names or option
// semantics drift, only a real parse notices.
import { describe, it, expect, afterAll } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { scanDirectory, mergeEntries } from "../ingest";
import { BASE_FIXTURE, jpegWithExif, jpegWithoutExif } from "./exif-fixture";

const tmpDirs: string[] = [];

async function corpusDir(files: Record<string, Buffer>): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "corpus-e2e-"));
  tmpDirs.push(dir);
  for (const [name, bytes] of Object.entries(files)) {
    const full = path.join(dir, name);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, bytes);
  }
  return dir;
}

afterAll(async () => {
  await Promise.all(tmpDirs.map((d) => rm(d, { recursive: true, force: true })));
});

describe("ingest over real EXIF bytes", () => {
  it("reads the exposure off a real APP1 segment and derives EV 13", async () => {
    const dir = await corpusDir({ "a.jpg": jpegWithExif(BASE_FIXTURE) });
    const { scanned } = await scanDirectory(dir);

    expect(scanned).toHaveLength(1);
    expect(scanned[0].exif).toEqual({
      present: true,
      iso: 100,
      apertureN: 8,
      shutterSec: 1 / 128,
      exposureBiasEv: 0,
      // EXIFR_OPTIONS sets translateValues:false, so code 5 arrives as a number
      // and ingest is the thing that names it.
      meteringMode: "pattern",
      make: "TestCam",
      model: "TC-1",
    });
    expect(scanned[0].capturedAt).not.toBeNull();

    const { entries } = mergeEntries(null, scanned);
    expect(entries[0].groundTruth.ev100).toBe(13);
  });

  it("gives the same ev100 whether the frame carries -1 EV of bias or none", async () => {
    const dir = await corpusDir({
      "biased.jpg": jpegWithExif({ ...BASE_FIXTURE, biasNum: -1, biasDen: 1 }),
      "unbiased.jpg": jpegWithExif(BASE_FIXTURE, "x"),
    });
    const { scanned } = await scanDirectory(dir);
    const { entries } = mergeEntries(null, scanned);

    const biased = entries.find((e) => e.file === "biased.jpg");
    const unbiased = entries.find((e) => e.file === "unbiased.jpg");
    expect(biased?.exif.exposureBiasEv).toBe(-1);
    expect(unbiased?.exif.exposureBiasEv).toBe(0);
    expect(biased?.groundTruth.ev100).toBe(13);
    expect(unbiased?.groundTruth.ev100).toBe(13);
  });

  it("handles a file with no EXIF at all without throwing", async () => {
    const dir = await corpusDir({ "plain.jpg": jpegWithoutExif() });
    const { scanned } = await scanDirectory(dir);
    expect(scanned[0].exif.present).toBe(false);
    expect(scanned[0].capturedAt).toBeNull();

    const { entries, needs_labels } = mergeEntries(null, scanned);
    expect(entries[0].groundTruth.ev100).toBeNull();
    expect(needs_labels).toHaveLength(1);
  });

  it("normalises a high-ISO wide-open frame to ISO 100", async () => {
    // f/1.8, 1/32, ISO 3200: log2(3.24*32) = 6.695, minus 5 stops of ISO.
    const dir = await corpusDir({
      "dim.jpg": jpegWithExif({ ...BASE_FIXTURE, fNumber: 1.8, exposureTimeDen: 32, iso: 3200 }),
    });
    const { scanned } = await scanDirectory(dir);
    const { entries } = mergeEntries(null, scanned);
    expect(entries[0].exif.iso).toBe(3200);
    expect(entries[0].groundTruth.ev100).toBeCloseTo(1.695, 2);
  });

  it("gives identical bytes in two folders the same id and keeps only one", async () => {
    const dir = await corpusDir({
      "day1/a.jpg": jpegWithExif(BASE_FIXTURE),
      "day2/copy.jpg": jpegWithExif(BASE_FIXTURE),
    });
    const { scanned, duplicates } = await scanDirectory(dir);
    expect(scanned).toHaveLength(1);
    expect(duplicates).toHaveLength(1);
    expect(duplicates[0].id).toBe(scanned[0].id);
  });
});
