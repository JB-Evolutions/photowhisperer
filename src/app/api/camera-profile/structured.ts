// Structured camera profile persistence (BodyProfile fields on camera_profiles,
// one camera_lenses row per LensProfile). Route-local on purpose.
//
// Not atomic: the profile upsert, lens delete and lens insert are three
// statements. A failure part-way leaves the previous lenses deleted; the
// onboarding UI keeps the unsaved list in state and offers a retry, and a
// retried save rewrites the whole set.
import type { createClient } from "@/lib/supabase/server";
import type { BodyProfile, Confidence, LensProfile } from "@/lib/contract/types";

type ServerClient = Awaited<ReturnType<typeof createClient>>;

export type StructuredProfileInput = {
  body: string | null;
  cropFactor: number | null;
  ibisStops: number | null;
  isoBase: number;
  isoMode: BodyProfile["isoMode"];
  isoValue: number | null;
  isoMax: number | null;
  lenses: LensProfile[];
};

export type StructuredProfileRead = Omit<StructuredProfileInput, "body">;

export const MAX_LENSES = 50;
const MAX_LABEL_LENGTH = 255;
const ISO_MODES = new Set(["auto", "locked", "capped"]);
const CONFIDENCES = new Set<Confidence>(["high", "low", "unknown"]);

// Upper bounds follow the NUMERIC(p,s) column precisions in 015.
const LIMITS = {
  cropFactor: 99.99, // NUMERIC(4,2)
  stops: 99.9, // NUMERIC(3,1)
  focalMm: 99999.9, // NUMERIC(6,1)
  aperture: 99.99, // NUMERIC(4,2)
};

type Validation = { ok: true; value: StructuredProfileInput } | { ok: false; message: string };

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

// undefined → invalid, null → null, number in (min, max] → number.
function optionalNumber(
  v: unknown,
  { min, max, inclusiveMin = false }: { min: number; max: number; inclusiveMin?: boolean },
): number | null | undefined {
  if (v === null) return null;
  if (!isFiniteNumber(v)) return undefined;
  if (inclusiveMin ? v < min : v <= min) return undefined;
  if (v > max) return undefined;
  return v;
}

function positiveInt(v: unknown): number | undefined {
  return isFiniteNumber(v) && Number.isInteger(v) && v > 0 && v <= 2_147_483_647 ? v : undefined;
}

function validateLens(raw: unknown, index: number): { ok: true; lens: LensProfile } | { ok: false; message: string } {
  const where = `lenses[${index}]`;
  if (typeof raw !== "object" || raw === null) return { ok: false, message: `${where} must be an object.` };
  const r = raw as Record<string, unknown>;

  if (typeof r.label !== "string" || r.label.trim().length === 0 || r.label.length > MAX_LABEL_LENGTH) {
    return { ok: false, message: `${where}.label must be a non-empty string of ${MAX_LABEL_LENGTH} characters or fewer.` };
  }
  const focalMinMm = optionalNumber(r.focalMinMm, { min: 0, max: LIMITS.focalMm });
  const focalMaxMm = optionalNumber(r.focalMaxMm, { min: 0, max: LIMITS.focalMm });
  const aperWide = optionalNumber(r.aperWide, { min: 0, max: LIMITS.aperture });
  const aperTele = optionalNumber(r.aperTele, { min: 0, max: LIMITS.aperture });
  const stabStops = optionalNumber(r.stabStops, { min: 0, max: LIMITS.stops, inclusiveMin: true });
  if (focalMinMm === undefined || focalMaxMm === undefined) {
    return { ok: false, message: `${where} focal lengths must be positive numbers or null.` };
  }
  if (aperWide === undefined || aperTele === undefined) {
    return { ok: false, message: `${where} apertures must be positive numbers or null.` };
  }
  if (stabStops === undefined) {
    return { ok: false, message: `${where}.stabStops must be a non-negative number or null.` };
  }
  if (r.stabilised !== null && typeof r.stabilised !== "boolean") {
    return { ok: false, message: `${where}.stabilised must be true, false or null.` };
  }
  if (!CONFIDENCES.has(r.confidence as Confidence)) {
    return { ok: false, message: `${where}.confidence must be 'high', 'low' or 'unknown'.` };
  }
  if (focalMinMm !== null && focalMaxMm !== null && focalMaxMm < focalMinMm) {
    return { ok: false, message: `${where}.focalMaxMm must be at least focalMinMm.` };
  }
  if (aperWide !== null && aperTele !== null && aperTele < aperWide) {
    return { ok: false, message: `${where}.aperTele must be at least aperWide.` };
  }

  return {
    ok: true,
    lens: {
      label: r.label,
      focalMinMm,
      focalMaxMm,
      aperWide,
      aperTele,
      stabilised: r.stabilised as boolean | null,
      stabStops,
      confidence: r.confidence as Confidence,
    },
  };
}

export function validateStructuredProfile(body: unknown, raw: unknown): Validation {
  if (body !== null && (typeof body !== "string" || body.length > MAX_LABEL_LENGTH)) {
    return { ok: false, message: `body must be a string of ${MAX_LABEL_LENGTH} characters or fewer, or null.` };
  }
  if (typeof raw !== "object" || raw === null) {
    return { ok: false, message: "structured must be an object." };
  }
  const r = raw as Record<string, unknown>;

  const cropFactor = optionalNumber(r.cropFactor, { min: 0, max: LIMITS.cropFactor });
  if (cropFactor === undefined) return { ok: false, message: "cropFactor must be a positive number or null." };

  const ibisStops = optionalNumber(r.ibisStops, { min: 0, max: LIMITS.stops, inclusiveMin: true });
  if (ibisStops === undefined) return { ok: false, message: "ibisStops must be a non-negative number or null." };

  const isoBase = positiveInt(r.isoBase);
  if (isoBase === undefined) return { ok: false, message: "isoBase must be a positive integer." };

  if (!ISO_MODES.has(r.isoMode as string)) {
    return { ok: false, message: "isoMode must be 'auto', 'locked' or 'capped'." };
  }
  const isoMode = r.isoMode as BodyProfile["isoMode"];

  const isoValue = r.isoValue === null ? null : positiveInt(r.isoValue);
  const isoMax = r.isoMax === null ? null : positiveInt(r.isoMax);
  if (isoValue === undefined) return { ok: false, message: "isoValue must be a positive integer or null." };
  if (isoMax === undefined) return { ok: false, message: "isoMax must be a positive integer or null." };
  if (isoMode === "locked" && isoValue === null) {
    return { ok: false, message: "isoValue is required when isoMode is 'locked'." };
  }
  if (isoMode === "capped" && isoMax === null) {
    return { ok: false, message: "isoMax is required when isoMode is 'capped'." };
  }

  if (!Array.isArray(r.lenses) || r.lenses.length > MAX_LENSES) {
    return { ok: false, message: `lenses must be an array of at most ${MAX_LENSES} lenses.` };
  }
  const lenses: LensProfile[] = [];
  for (let i = 0; i < r.lenses.length; i++) {
    const result = validateLens(r.lenses[i], i);
    if (!result.ok) return result;
    lenses.push(result.lens);
  }

  return {
    ok: true,
    value: { body: body as string | null, cropFactor, ibisStops, isoBase, isoMode, isoValue, isoMax, lenses },
  };
}

export async function saveStructuredProfile(
  supabase: ServerClient,
  userId: string,
  input: StructuredProfileInput,
): Promise<void> {
  // Profile row first: camera_lenses.user_id references camera_profiles.
  // The legacy TEXT[] column is kept in sync until it is dropped.
  const { error: profileError } = await supabase.from("camera_profiles").upsert(
    {
      user_id: userId,
      body: input.body,
      lenses: input.lenses.length > 0 ? input.lenses.map((l) => l.label) : null,
      crop_factor: input.cropFactor,
      ibis_stops: input.ibisStops,
      iso_base: input.isoBase,
      iso_mode: input.isoMode,
      iso_value: input.isoValue,
      iso_max: input.isoMax,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (profileError) throw profileError;

  const { error: deleteError } = await supabase.from("camera_lenses").delete().eq("user_id", userId);
  if (deleteError) throw deleteError;

  if (input.lenses.length === 0) return;

  const { error: insertError } = await supabase.from("camera_lenses").insert(
    input.lenses.map((lens, ordinal) => ({
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
    })),
  );
  if (insertError) throw insertError;
}

// NUMERIC can arrive as a string depending on precision; never invent a value.
function num(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function loadStructuredProfile(
  supabase: ServerClient,
  userId: string,
): Promise<StructuredProfileRead | null> {
  const { data: profile, error: profileError } = await supabase
    .from("camera_profiles")
    .select("crop_factor, ibis_stops, iso_base, iso_mode, iso_value, iso_max")
    .eq("user_id", userId)
    .maybeSingle();
  if (profileError) throw profileError;
  if (!profile) return null;

  const { data: lensRows, error: lensError } = await supabase
    .from("camera_lenses")
    .select("label, focal_min_mm, focal_max_mm, aper_wide, aper_tele, stabilised, stab_stops, confidence")
    .eq("user_id", userId)
    .order("ordinal", { ascending: true });
  if (lensError) throw lensError;

  return {
    cropFactor: num(profile.crop_factor),
    ibisStops: num(profile.ibis_stops),
    isoBase: num(profile.iso_base) ?? 100,
    isoMode: profile.iso_mode as BodyProfile["isoMode"],
    isoValue: num(profile.iso_value),
    isoMax: num(profile.iso_max),
    lenses: (lensRows ?? []).map((row) => ({
      label: row.label as string,
      focalMinMm: num(row.focal_min_mm),
      focalMaxMm: num(row.focal_max_mm),
      aperWide: num(row.aper_wide),
      aperTele: num(row.aper_tele),
      stabilised: typeof row.stabilised === "boolean" ? row.stabilised : null,
      stabStops: num(row.stab_stops),
      confidence: row.confidence as Confidence,
    })),
  };
}
