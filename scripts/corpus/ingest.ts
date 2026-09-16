// Turn a folder of photos into a corpus manifest.
//
//   pnpm tsx scripts/corpus/ingest.ts <dir> [--out manifest.json]
//
// Defaults --out to <dir>/manifest.json. Re-running against an existing
// manifest refreshes the EXIF block and leaves every human-entered label
// untouched — see mergeEntries.
import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import exifr from "exifr";
import { EXIFR_OPTIONS } from "../../src/lib/image/exif";
import { groundTruthEv100OrNull } from "./ev";
import {
  MANIFEST_VERSION,
  type CorpusDraftEntry,
  type CorpusExif,
  type CorpusManifest,
  type NeedsLabel,
} from "./manifest";

const IMAGE_EXTENSIONS: ReadonlySet<string> = new Set([
  ".jpg", ".jpeg", ".png", ".heic", ".heif", ".tif", ".tiff", ".webp",
  ".dng", ".cr2", ".cr3", ".nef", ".arw", ".raf", ".orf", ".rw2",
]);

// EXIF tag 0x9207. EXIFR_OPTIONS sets translateValues:false, so this arrives as
// a number and is named here rather than left as a bare code in the manifest.
const METERING_MODES: Record<number, string> = {
  0: "unknown", 1: "average", 2: "center_weighted_average", 3: "spot",
  4: "multi_spot", 5: "pattern", 6: "partial", 255: "other",
};

export type ScannedImage = {
  id: string;
  file: string;
  capturedAt: string | null;
  exif: CorpusExif;
};

function positiveNumber(value: unknown): number | null {
  // ISOSpeedRatings is multi-valued in some files; the first entry is the one used.
  const v = Array.isArray(value) ? value[0] : value;
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null;
}

function finiteNumber(value: unknown): number | null {
  const v = Array.isArray(value) ? value[0] : value;
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function capturedAtFrom(raw: Record<string, unknown> | null): string | null {
  const v = raw?.DateTimeOriginal ?? raw?.CreateDate ?? null;
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString();
  if (typeof v === "string" && v.trim().length > 0) {
    const parsed = new Date(v);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  return null;
}

export function exifBlockFrom(raw: Record<string, unknown> | null): CorpusExif {
  if (!raw) {
    return {
      present: false, iso: null, apertureN: null, shutterSec: null,
      exposureBiasEv: null, meteringMode: null, make: null, model: null,
    };
  }
  const metering = finiteNumber(raw.MeteringMode);
  return {
    present: true,
    iso: positiveNumber(raw.ISO ?? raw.ISOSpeedRatings),
    apertureN: positiveNumber(raw.FNumber),
    shutterSec: positiveNumber(raw.ExposureTime),
    // exifr names tag 0x9204 (ExposureBiasValue) "ExposureCompensation".
    // Recorded for audit only — never summed into ev100, see ev.ts.
    exposureBiasEv: finiteNumber(raw.ExposureCompensation ?? raw.ExposureBiasValue),
    meteringMode: metering === null
      ? nonEmptyString(raw.MeteringMode)
      : (METERING_MODES[metering] ?? `unknown_${metering}`),
    make: nonEmptyString(raw.Make),
    model: nonEmptyString(raw.Model),
  };
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function freshEntry(scan: ScannedImage): CorpusDraftEntry {
  const ev100 = groundTruthEv100OrNull(scan.exif, 0);
  return {
    id: scan.id,
    file: scan.file,
    capturedAt: scan.capturedAt,
    condition: null,      // human label
    indoor: null,         // human label
    subjectLit: null,     // human label
    groundTruth: {
      ev100: ev100 === null ? null : round3(ev100),
      source: "exif_auto_judged",
      judgedOffStops: 0,
      confidence: "medium",
    },
    exif: scan.exif,
    notes: null,          // human label
  };
}

// Refresh an existing entry from a fresh scan of the same bytes.
//
// PRESERVED (human-entered): condition, indoor, subjectLit, notes, and
// groundTruth.source / judgedOffStops / confidence.
// REFRESHED (file-derived): the whole exif block, capturedAt, and file (a photo
// can be renamed or moved; identity is the byte hash, not the path).
//
// ev100 follows the source. Under "exif_auto_judged" it is derived, so it is
// recomputed from the refreshed EXIF while keeping the human's judgedOffStops.
// Under "exif_manual" or "meter" a person put that number there by hand and it
// is carried over untouched.
export function refreshEntry(existing: CorpusDraftEntry, scan: ScannedImage): CorpusDraftEntry {
  const derived = existing.groundTruth.source === "exif_auto_judged";
  const recomputed = derived
    ? groundTruthEv100OrNull(scan.exif, existing.groundTruth.judgedOffStops)
    : null;
  return {
    ...existing,
    file: scan.file,
    capturedAt: scan.capturedAt,
    exif: scan.exif,
    groundTruth: {
      ...existing.groundTruth,
      ev100: derived
        ? (recomputed === null ? null : round3(recomputed))
        : existing.groundTruth.ev100,
    },
  };
}

export type MergeResult = {
  entries: CorpusDraftEntry[];
  needs_labels: NeedsLabel[];
  added: string[];
  refreshed: string[];
  missing: string[];   // in the manifest but not in the scanned folder — kept, never dropped
};

// Merge a scan into an existing manifest. Labelling work is never destroyed:
// an entry whose file was not seen in this scan stays in the manifest and is
// only reported, because the photo may simply be offline.
export function mergeEntries(
  previous: CorpusManifest | null,
  scanned: readonly ScannedImage[],
): MergeResult {
  const byId = new Map<string, CorpusDraftEntry>();
  for (const entry of previous?.entries ?? []) byId.set(entry.id, entry);

  const seen = new Set<string>();
  const added: string[] = [];
  const refreshed: string[] = [];
  const merged: CorpusDraftEntry[] = [];

  for (const scan of scanned) {
    seen.add(scan.id);
    const existing = byId.get(scan.id);
    if (existing) {
      merged.push(refreshEntry(existing, scan));
      refreshed.push(scan.id);
    } else {
      merged.push(freshEntry(scan));
      added.push(scan.id);
    }
  }

  const missing: string[] = [];
  for (const [id, entry] of byId) {
    if (!seen.has(id)) {
      merged.push(entry);
      missing.push(id);
    }
  }

  merged.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0));

  const needs_labels: NeedsLabel[] = merged
    .filter((e) => e.groundTruth.ev100 === null)
    .map((e) => ({ id: e.id, file: e.file, reason: "no_exposure_exif" as const }));

  return { entries: merged, needs_labels, added, refreshed, missing };
}

async function* walkImages(root: string, dir: string): AsyncGenerator<string> {
  const dirents = await readdir(dir, { withFileTypes: true });
  for (const dirent of dirents.sort((a, b) => (a.name < b.name ? -1 : 1))) {
    if (dirent.name.startsWith(".")) continue;
    const full = path.join(dir, dirent.name);
    if (dirent.isDirectory()) {
      yield* walkImages(root, full);
    } else if (IMAGE_EXTENSIONS.has(path.extname(dirent.name).toLowerCase())) {
      yield path.relative(root, full);
    }
  }
}

export async function scanDirectory(root: string): Promise<{
  scanned: ScannedImage[];
  duplicates: { file: string; duplicateOf: string; id: string }[];
}> {
  const scanned: ScannedImage[] = [];
  const duplicates: { file: string; duplicateOf: string; id: string }[] = [];
  const byId = new Map<string, string>();

  for await (const file of walkImages(root, root)) {
    const bytes = await readFile(path.join(root, file));
    const id = createHash("sha256").update(bytes).digest("hex").slice(0, 12);

    const firstSeen = byId.get(id);
    if (firstSeen !== undefined) {
      duplicates.push({ file, duplicateOf: firstSeen, id });
      continue;
    }
    byId.set(id, file);

    let raw: Record<string, unknown> | null = null;
    try {
      const out: unknown = await exifr.parse(bytes, EXIFR_OPTIONS);
      raw = out && typeof out === "object" && Object.keys(out).length > 0
        ? (out as Record<string, unknown>)
        : null;
    } catch {
      raw = null;
    }

    scanned.push({ id, file, capturedAt: capturedAtFrom(raw), exif: exifBlockFrom(raw) });
  }

  return { scanned, duplicates };
}

function parseArgs(argv: readonly string[]): { dir: string; out: string } {
  const positional: string[] = [];
  let out: string | null = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--out") {
      out = argv[i + 1] ?? null;
      i++;
    } else if (argv[i].startsWith("--out=")) {
      out = argv[i].slice("--out=".length);
    } else {
      positional.push(argv[i]);
    }
  }
  if (positional.length !== 1 || out === "") {
    throw new Error("usage: pnpm tsx scripts/corpus/ingest.ts <dir> [--out manifest.json]");
  }
  const dir = path.resolve(positional[0]);
  return { dir, out: out === null ? path.join(dir, "manifest.json") : path.resolve(out) };
}

async function readManifest(file: string): Promise<CorpusManifest | null> {
  try {
    const text = await readFile(file, "utf8");
    return JSON.parse(text) as CorpusManifest;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw new Error(`could not read existing manifest ${file}: ${(err as Error).message}`);
  }
}

async function main(): Promise<void> {
  const { dir, out } = parseArgs(process.argv.slice(2));
  const previous = await readManifest(out);
  const { scanned, duplicates } = await scanDirectory(dir);
  const result = mergeEntries(previous, scanned);

  const manifest: CorpusManifest = {
    version: MANIFEST_VERSION,
    generatedAt: new Date().toISOString(),
    root: path.relative(process.cwd(), dir) || ".",
    entries: result.entries,
    needs_labels: result.needs_labels,
  };
  await writeFile(out, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  console.log(`corpus: ${result.entries.length} entries -> ${out}`);
  console.log(`  ${result.added.length} added, ${result.refreshed.length} refreshed (labels preserved)`);
  if (duplicates.length > 0) {
    console.log(`  ${duplicates.length} duplicate(s) skipped:`);
    for (const d of duplicates) console.log(`    ${d.file} == ${d.duplicateOf} (${d.id})`);
  }
  if (result.missing.length > 0) {
    console.log(`  ${result.missing.length} manifest entr(ies) not found in ${dir} — KEPT, not dropped:`);
    for (const id of result.missing) console.log(`    ${id}`);
  }
  if (result.needs_labels.length > 0) {
    console.log(`  ${result.needs_labels.length} entr(ies) need a metered EV (no exposure EXIF):`);
    for (const n of result.needs_labels) console.log(`    ${n.file}`);
  }
}

// Only run as a CLI. Under vitest process.argv[1] is the test runner, so the
// module imports cleanly for unit tests.
if (process.argv[1]?.endsWith("ingest.ts")) {
  main().catch((err: unknown) => {
    console.error(`ingest failed: ${(err as Error).message}`);
    process.exitCode = 1;
  });
}
