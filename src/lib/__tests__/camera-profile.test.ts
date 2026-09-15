import { describe, it, expect, beforeEach, vi } from "vitest";

// In-memory stand-in for the two tables, reached through the same query-builder
// calls camera-profile.ts makes.
const { db } = vi.hoisted(() => {
  type Row = Record<string, unknown>;
  const db = {
    camera_profiles: [] as Row[],
    camera_lenses: [] as Row[],
    failLensInsert: false,
  };

  function project(row: Row, cols: string | null): Row {
    if (!cols) return { ...row };
    const out: Row = {};
    for (const c of cols.split(",").map((s) => s.trim())) out[c] = row[c] ?? null;
    return out;
  }

  function builder(table: "camera_profiles" | "camera_lenses") {
    let op: "select" | "upsert" | "delete" | "insert" = "select";
    let payload: unknown = null;
    let cols: string | null = null;
    const filters: Array<[string, unknown]> = [];
    let orderBy: { col: string; ascending: boolean } | null = null;

    const run = (): { data: Row[] | null; error: { message: string } | null } => {
      const rows = db[table];
      const match = (r: Row) => filters.every(([c, v]) => r[c] === v);
      if (op === "insert") {
        if (table === "camera_lenses" && db.failLensInsert) return { data: null, error: { message: "insert failed" } };
        for (const r of payload as Row[]) {
          if (typeof r.label !== "string") return { data: null, error: { message: "label not null" } };
          rows.push({ ...r });
        }
        return { data: null, error: null };
      }
      if (op === "delete") {
        db[table] = rows.filter((r) => !match(r));
        return { data: null, error: null };
      }
      if (op === "upsert") {
        const p = payload as Row;
        const existing = rows.find((r) => r.user_id === p.user_id);
        let merged: Row;
        if (existing) {
          Object.assign(existing, p);
          merged = existing;
        } else {
          merged = { body: null, lenses: null, flash: null, notes: null, iso_base: 100, iso_mode: "auto", ...p };
          rows.push(merged);
        }
        return { data: [project(merged, cols)], error: null };
      }
      let out = rows.filter(match);
      if (orderBy) {
        const { col, ascending } = orderBy;
        out = [...out].sort((a, b) => ((a[col] as number) - (b[col] as number)) * (ascending ? 1 : -1));
      }
      return { data: out.map((r) => project(r, cols)), error: null };
    };

    const b: Record<string, unknown> = {
      select(c: string) { cols = c; return b; },
      eq(c: string, v: unknown) { filters.push([c, v]); return b; },
      order(col: string, opts: { ascending: boolean }) { orderBy = { col, ascending: opts.ascending }; return b; },
      upsert(p: unknown) { op = "upsert"; payload = p; return b; },
      delete() { op = "delete"; return b; },
      insert(p: unknown) { op = "insert"; payload = p; return b; },
      async maybeSingle() { const r = run(); return { data: r.data?.[0] ?? null, error: r.error }; },
      async single() { const r = run(); return { data: r.data?.[0] ?? null, error: r.error }; },
      then(resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) {
        return Promise.resolve(run()).then(resolve, reject);
      },
    };
    return b;
  }

  return { db: Object.assign(db, { builder }) };
});

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from: (table: "camera_profiles" | "camera_lenses") => db.builder(table),
  })),
}));

import {
  getCameraProfile,
  upsertCameraProfile,
  getGearProfile,
  upsertGearProfile,
  type CameraProfile,
  type GearProfile,
} from "../camera-profile";
import { parseLensString } from "../lens/parse";

const USER = "user-1";

describe("camera-profile legacy shape over camera_lenses", () => {
  beforeEach(() => {
    db.camera_profiles = [];
    db.camera_lenses = [];
    db.failLensInsert = false;
    vi.restoreAllMocks();
  });

  it("PUT the legacy shape, GET it back: { body, lenses, flash, notes } deep-equal", async () => {
    const legacy: CameraProfile = {
      body: "Sony A7 IV",
      lenses: ["Sony FE 24-70mm f/2.8 GM II", "my old nifty fifty", ""],
      flash: "Godox V1",
      notes: "Mostly weddings",
    };

    const returned = await upsertCameraProfile(USER, legacy);
    const fetched = await getCameraProfile(USER);

    expect(returned).toEqual(legacy);
    expect(fetched).toEqual(legacy);
  });

  it("dual-writes: raw strings to the legacy column, parsed rows to camera_lenses", async () => {
    const lenses = ["Sony FE 24-70mm f/2.8 GM II", "my old nifty fifty"];

    await upsertCameraProfile(USER, { body: "Sony A7 IV", lenses });

    expect(db.camera_profiles[0].lenses).toEqual(lenses);
    expect(db.camera_lenses.map((r) => [r.ordinal, r.label])).toEqual([[0, lenses[0]], [1, lenses[1]]]);
    const parsed = parseLensString(lenses[0]);
    expect(db.camera_lenses[0]).toMatchObject({
      focal_min_mm: parsed.focalMinMm,
      focal_max_mm: parsed.focalMaxMm,
      aper_wide: parsed.aperWide,
      confidence: parsed.confidence,
    });
  });

  it("a partial update keeps untouched fields and replaces the lens rows", async () => {
    await upsertCameraProfile(USER, { body: "Nikon Z6", lenses: ["Nikkor Z 50mm f/1.8 S"], flash: null, notes: null });
    await upsertCameraProfile(USER, { lenses: ["Nikkor Z 24-120mm f/4 S"] });

    expect(await getCameraProfile(USER)).toEqual({
      body: "Nikon Z6",
      lenses: ["Nikkor Z 24-120mm f/4 S"],
      flash: null,
      notes: null,
    });
    expect(db.camera_lenses).toHaveLength(1);
  });

  it("lenses null and [] round-trip unchanged", async () => {
    await upsertCameraProfile(USER, { body: "X", lenses: null, flash: null, notes: null });
    expect(await getCameraProfile(USER)).toEqual({ body: "X", lenses: null, flash: null, notes: null });

    await upsertCameraProfile(USER, { lenses: [] });
    expect(await getCameraProfile(USER)).toEqual({ body: "X", lenses: [], flash: null, notes: null });
  });

  it("no camera_lenses rows → lenses come from the legacy column", async () => {
    db.camera_profiles.push({ user_id: USER, body: "Canon R6", lenses: ["RF 35mm F1.8"], flash: null, notes: null });

    expect(await getCameraProfile(USER)).toEqual({
      body: "Canon R6",
      lenses: ["RF 35mm F1.8"],
      flash: null,
      notes: null,
    });
  });

  it("a camera_lenses write failure is logged, not thrown, and the legacy column stays authoritative", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    db.failLensInsert = true;
    const legacy: CameraProfile = { body: "Fuji X-T5", lenses: ["XF 23mm f/2"], flash: null, notes: null };

    const returned = await upsertCameraProfile(USER, legacy);

    expect(returned).toEqual(legacy);
    expect(await getCameraProfile(USER)).toEqual(legacy);
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it("returns null when there is no profile row", async () => {
    expect(await getCameraProfile(USER)).toBeNull();
    expect(await getGearProfile(USER)).toBeNull();
  });
});

describe("getGearProfile / upsertGearProfile", () => {
  beforeEach(() => {
    db.camera_profiles = [];
    db.camera_lenses = [];
    db.failLensInsert = false;
  });

  it("round-trips a structured profile", async () => {
    const gear: GearProfile = {
      body: {
        label: "Fuji X-T5",
        cropFactor: 1.5,
        ibisStops: 7,
        isoBase: 125,
        isoMode: "capped",
        isoValue: null,
        isoMax: 6400,
      },
      lenses: [
        {
          label: "XF 16-55mm f/2.8",
          focalMinMm: 16,
          focalMaxMm: 55,
          aperWide: 2.8,
          aperTele: 2.8,
          stabilised: false,
          stabStops: null,
          confidence: "high",
        },
      ],
    };

    await upsertGearProfile(USER, gear);

    expect(await getGearProfile(USER)).toEqual(gear);
    expect(await getCameraProfile(USER)).toMatchObject({ body: "Fuji X-T5", lenses: ["XF 16-55mm f/2.8"] });
  });

  it("parses backfilled raw rows and converts NUMERIC strings", async () => {
    db.camera_profiles.push({
      user_id: USER,
      body: "Sony A6000",
      lenses: ["Sony 18-55 f/3.5-5.6"],
      crop_factor: "1.50",
      ibis_stops: null,
      iso_base: 100,
      iso_mode: "locked",
      iso_value: 800,
      iso_max: null,
    });
    // 015 backfill shape: raw label, every numeric NULL, confidence 'unknown'.
    db.camera_lenses.push({
      user_id: USER,
      ordinal: 0,
      label: "Sony 18-55 f/3.5-5.6",
      focal_min_mm: null,
      focal_max_mm: null,
      aper_wide: null,
      aper_tele: null,
      stabilised: null,
      stab_stops: null,
      confidence: "unknown",
    });

    const gear = await getGearProfile(USER);

    expect(gear?.body).toEqual({
      label: "Sony A6000",
      cropFactor: 1.5,
      ibisStops: null,
      isoBase: 100,
      isoMode: "locked",
      isoValue: 800,
      isoMax: null,
    });
    expect(gear?.lenses).toEqual([parseLensString("Sony 18-55 f/3.5-5.6")]);
  });

  it("no lens rows → parses the legacy column, skipping blanks", async () => {
    db.camera_profiles.push({ user_id: USER, body: null, lenses: ["Sony 18-55 f/3.5-5.6", " "] });

    const gear = await getGearProfile(USER);

    expect(gear?.body.label).toBe("unknown");
    expect(gear?.body.isoMode).toBe("auto");
    expect(gear?.lenses).toEqual([parseLensString("Sony 18-55 f/3.5-5.6")]);
  });
});
