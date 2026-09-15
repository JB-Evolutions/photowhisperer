// Per arch-spec-v3.1.md §2.5. Mirrors the subscription-tier lookup pattern in
// src/app/api/settings/route.ts: cookie-scoped client, RLS permits the row.
//
// Two shapes over the same rows:
//   - CameraProfile (legacy free text) for /api/camera-profile GET/PUT and
//     auth/callback. Its signatures and return shapes must not change.
//   - GearProfile (BodyProfile + LensProfile[]) for the exposure ladder.
// camera_profiles.lenses (TEXT[]) stays the compatibility anchor until it is
// dropped; camera_lenses is written alongside it.
import { createClient as createServerClient } from "./supabase/server";
import { parseLensString } from "./lens/parse";
import type { BodyProfile, Confidence, LensProfile } from "./contract/types";
import type { CameraProfile, GearProfile } from "../api/types";

export type { CameraProfile, GearProfile };

const LENS_COLUMNS =
  "label, focal_min_mm, focal_max_mm, aper_wide, aper_tele, stabilised, stab_stops, confidence";

const ISO_MODES: readonly BodyProfile["isoMode"][] = ["auto", "locked", "capped"];
const CONFIDENCES: readonly Confidence[] = ["high", "low", "unknown"];

// NUMERIC can arrive as a string depending on precision; never invent a value.
function num(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

// A blank label has nothing to parse. It is still stored, so a legacy PUT of
// ["", …] reads back identically.
function lensFromLabel(label: string): LensProfile {
  if (label.trim() === "") {
    return {
      label,
      focalMinMm: null,
      focalMaxMm: null,
      aperWide: null,
      aperTele: null,
      stabilised: null,
      stabStops: null,
      confidence: "unknown",
    };
  }
  return parseLensString(label);
}

function lensFromRow(row: Record<string, unknown>): LensProfile {
  const label = typeof row.label === "string" ? row.label : "";
  const lens: LensProfile = {
    label,
    focalMinMm: num(row.focal_min_mm),
    focalMaxMm: num(row.focal_max_mm),
    aperWide: num(row.aper_wide),
    aperTele: num(row.aper_tele),
    stabilised: typeof row.stabilised === "boolean" ? row.stabilised : null,
    stabStops: num(row.stab_stops),
    confidence: CONFIDENCES.includes(row.confidence as Confidence)
      ? (row.confidence as Confidence)
      : "unknown",
  };
  // 015 backfilled raw labels with every field NULL and confidence 'unknown'
  // — parsing was left to the app, so it happens here on read.
  const untouched =
    lens.confidence === "unknown" &&
    lens.focalMinMm === null &&
    lens.focalMaxMm === null &&
    lens.aperWide === null &&
    lens.aperTele === null &&
    lens.stabilised === null &&
    lens.stabStops === null;
  return untouched ? lensFromLabel(label) : lens;
}

function lensRow(userId: string, lens: LensProfile, ordinal: number) {
  return {
    user_id: userId,
    ordinal,
    label: lens.label,
    focal_min_mm: lens.focalMinMm,
    focal_max_mm: lens.focalMaxMm,
    aper_wide: lens.aperWide,
    aper_tele: lens.aperTele,
    stabilised: lens.stabilised,
    stab_stops: lens.stabStops,
    confidence: lens.confidence,
  };
}

export async function getCameraProfile(
  user_id: string
): Promise<CameraProfile | null> {
  const supabase = await createServerClient();

  const { data, error } = await supabase
    .from("camera_profiles")
    .select("body, lenses, flash, notes")
    .eq("user_id", user_id)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  // Raw labels from camera_lenses; the legacy column when there are no rows
  // (or they can't be read), so a pre-015 profile is served unchanged.
  let lenses: string[] | null = data.lenses;
  const { data: lensRows, error: lensError } = await supabase
    .from("camera_lenses")
    .select("label")
    .eq("user_id", user_id)
    .order("ordinal", { ascending: true });
  if (lensError) {
    console.error("getCameraProfile: camera_lenses read failed, using legacy lenses:", lensError);
  } else if (lensRows && lensRows.length > 0) {
    lenses = lensRows.map((row: { label: string }) => row.label);
  }

  return {
    body: data.body,
    lenses,
    flash: data.flash,
    notes: data.notes,
  };
}

// Only columns present in `updates` are sent to upsert, so unset fields keep
// their existing value on UPDATE (verified: a lenses-only upsert does not
// null out body/flash/notes on an existing row).
//
// Dual-write: the legacy column is written first and is what this returns.
// When lenses is present, camera_lenses is then rewritten from the same
// strings. A camera_lenses failure is logged, not rolled back — the legacy
// column stays authoritative. If the delete succeeds and the insert fails the
// user has no lens rows and reads fall back to the legacy column; if the
// delete itself fails the old rows remain and reads serve them until the
// next successful save.
export async function upsertCameraProfile(
  user_id: string,
  updates: Partial<CameraProfile>
): Promise<CameraProfile> {
  const supabase = await createServerClient();

  const fields: Partial<CameraProfile> = {};
  if (updates.body !== undefined) fields.body = updates.body;
  if (updates.lenses !== undefined) fields.lenses = updates.lenses;
  if (updates.flash !== undefined) fields.flash = updates.flash;
  if (updates.notes !== undefined) fields.notes = updates.notes;

  const { data, error } = await supabase
    .from("camera_profiles")
    .upsert(
      { user_id, ...fields, updated_at: new Date().toISOString() },
      { onConflict: "user_id" }
    )
    .select("body, lenses, flash, notes")
    .single();

  if (error) throw error;

  if (updates.lenses !== undefined) {
    try {
      const { error: deleteError } = await supabase
        .from("camera_lenses")
        .delete()
        .eq("user_id", user_id);
      if (deleteError) throw deleteError;

      const labels = updates.lenses ?? [];
      if (labels.length > 0) {
        const { error: insertError } = await supabase
          .from("camera_lenses")
          .insert(labels.map((label, i) => lensRow(user_id, lensFromLabel(label), i)));
        if (insertError) throw insertError;
      }
    } catch (lensErr) {
      console.error("upsertCameraProfile: camera_lenses write failed (legacy column saved):", lensErr);
    }
  }

  return {
    body: data.body,
    lenses: data.lenses,
    flash: data.flash,
    notes: data.notes,
  };
}

export async function getGearProfile(userId: string): Promise<GearProfile | null> {
  const supabase = await createServerClient();

  const { data, error } = await supabase
    .from("camera_profiles")
    .select("body, lenses, crop_factor, ibis_stops, iso_base, iso_mode, iso_value, iso_max")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const { data: lensRows, error: lensError } = await supabase
    .from("camera_lenses")
    .select(LENS_COLUMNS)
    .eq("user_id", userId)
    .order("ordinal", { ascending: true });
  if (lensError) throw lensError;

  const lenses: LensProfile[] =
    lensRows && lensRows.length > 0
      ? lensRows.map((row: Record<string, unknown>) => lensFromRow(row))
      : ((data.lenses as string[] | null) ?? [])
          .filter((label) => typeof label === "string" && label.trim() !== "")
          .map(lensFromLabel);

  return {
    body: {
      label: typeof data.body === "string" && data.body.trim() !== "" ? data.body : "unknown",
      cropFactor: num(data.crop_factor),
      ibisStops: num(data.ibis_stops),
      isoBase: num(data.iso_base) ?? 100,
      isoMode: ISO_MODES.includes(data.iso_mode) ? data.iso_mode : "auto",
      isoValue: num(data.iso_value),
      isoMax: num(data.iso_max),
    },
    // Blank labels are kept for the legacy round trip but give the ladder nothing.
    lenses: lenses.filter((lens) => lens.label.trim() !== ""),
  };
}

// Writes the whole structured profile: body columns and the legacy lens
// column in one upsert, then camera_lenses rewritten. Throws on any failure;
// see upsertCameraProfile for what a part-way failure leaves behind.
export async function upsertGearProfile(
  userId: string,
  { body, lenses }: GearProfile
): Promise<void> {
  const supabase = await createServerClient();

  const { error: profileError } = await supabase.from("camera_profiles").upsert(
    {
      user_id: userId,
      body: body.label,
      lenses: lenses.length > 0 ? lenses.map((lens) => lens.label) : null,
      crop_factor: body.cropFactor,
      ibis_stops: body.ibisStops,
      iso_base: body.isoBase,
      iso_mode: body.isoMode,
      iso_value: body.isoValue,
      iso_max: body.isoMax,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );
  if (profileError) throw profileError;

  const { error: deleteError } = await supabase
    .from("camera_lenses")
    .delete()
    .eq("user_id", userId);
  if (deleteError) throw deleteError;

  if (lenses.length === 0) return;

  const { error: insertError } = await supabase
    .from("camera_lenses")
    .insert(lenses.map((lens, i) => lensRow(userId, lens, i)));
  if (insertError) throw insertError;
}
