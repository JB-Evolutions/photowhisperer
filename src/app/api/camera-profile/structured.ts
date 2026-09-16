// Structured camera profile: validation of the PUT payload, and the shape the
// route reads and writes it in. Pure — no I/O, no Next or Supabase imports.
//
// KEEP IT THAT WAY. The onboarding screen is a client component and imports
// MAX_LENSES from here, so anything this file pulls in lands in the browser
// bundle. A value import of the persistence layer reaches next/headers through
// the server Supabase client and fails the Turbopack build. That is why the
// storage half lives in ./persist, which only the route imports.
import type { BodyProfile, Confidence, LensProfile } from "@/lib/contract/types";

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
