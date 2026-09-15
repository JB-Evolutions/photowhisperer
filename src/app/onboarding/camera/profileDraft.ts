// Body + ISO form state for onboarding, and the structured payload the
// camera-profile PUT accepts. Unknown is always a valid answer: an empty
// field is sent as null, never as a default that looks like a real value.
import type { BodyProfile, LensProfile } from "@/lib/contract/types";
import type { StructuredProfileRead } from "@/app/api/camera-profile/structured";
import { cropFactorForBody } from "./bodies";
import { draftToLens, type LensDraft } from "./lensDraft";

export type TriState = "yes" | "no" | "unknown";

export type BodyDraft = {
  body: string;
  cropFactor: string;
  // Once the user types a crop factor, picking a body no longer overwrites it.
  cropEdited: boolean;
  ibis: TriState;
  ibisStops: string;
  isoMode: BodyProfile["isoMode"];
  isoValue: string;
  isoMax: string;
};

export const DEFAULT_ISO_BASE = 100;

export const EMPTY_BODY_DRAFT: BodyDraft = {
  body: "",
  cropFactor: "",
  cropEdited: false,
  ibis: "unknown",
  ibisStops: "",
  isoMode: "auto",
  isoValue: "",
  isoMax: "",
};

export function setBodyLabel(draft: BodyDraft, body: string): BodyDraft {
  if (draft.cropEdited) return { ...draft, body };
  const crop = cropFactorForBody(body);
  return { ...draft, body, cropFactor: crop === null ? "" : String(crop) };
}

export function editCropFactor(draft: BodyDraft, cropFactor: string): BodyDraft {
  return { ...draft, cropFactor, cropEdited: true };
}

export type BodyField = "cropFactor" | "ibisStops" | "isoValue" | "isoMax";

export type BodyValue = Omit<StructuredProfileRead, "lenses"> & { body: string | null };

export type BodyResult = { ok: true; value: BodyValue } | { ok: false; field: BodyField; message: string };

const MIN_ISO = 25;
const MAX_ISO = 1_000_000;

type Read = { ok: true; value: number | null } | { ok: false };

function readDecimal(raw: string, max: number, { allowZero = false } = {}): Read {
  const s = raw.trim();
  if (s === "") return { ok: true, value: null };
  const n = Number(s);
  if (!Number.isFinite(n) || n > max || (allowZero ? n < 0 : n <= 0)) return { ok: false };
  return { ok: true, value: n };
}

function readIso(raw: string): Read {
  const s = raw.trim();
  if (s === "") return { ok: true, value: null };
  if (!/^\d+$/.test(s)) return { ok: false };
  const n = Number(s);
  return n >= MIN_ISO && n <= MAX_ISO ? { ok: true, value: n } : { ok: false };
}

export function bodyDraftToProfile(draft: BodyDraft): BodyResult {
  const crop = readDecimal(draft.cropFactor, 10);
  if (!crop.ok) return { ok: false, field: "cropFactor", message: "Crop factor needs to be a number, like 1.5." };

  let ibisStops: number | null = null;
  if (draft.ibis === "no") {
    ibisStops = 0;
  } else if (draft.ibis === "yes") {
    // Stabilised with stops unknown is stored as null: the stop count is what
    // the calculator uses, and a guess would overstate it.
    const stops = readDecimal(draft.ibisStops, 10, { allowZero: true });
    if (!stops.ok) return { ok: false, field: "ibisStops", message: "Stabilisation needs to be a number of stops, like 5." };
    ibisStops = stops.value;
  }

  let isoValue: number | null = null;
  let isoMax: number | null = null;
  if (draft.isoMode === "locked") {
    const iso = readIso(draft.isoValue);
    if (!iso.ok || iso.value === null) {
      return { ok: false, field: "isoValue", message: "Enter the ISO you lock to, like 100." };
    }
    isoValue = iso.value;
  } else if (draft.isoMode === "capped") {
    const iso = readIso(draft.isoMax);
    if (!iso.ok || iso.value === null) {
      return { ok: false, field: "isoMax", message: "Enter the highest ISO you'll allow, like 3200." };
    }
    isoMax = iso.value;
  }

  const body = draft.body.trim();
  return {
    ok: true,
    value: {
      body: body === "" ? null : body,
      cropFactor: crop.value,
      ibisStops,
      isoBase: DEFAULT_ISO_BASE,
      isoMode: draft.isoMode,
      isoValue,
      isoMax,
    },
  };
}

export type ProfilePayload = {
  body: string | null;
  structured: StructuredProfileRead;
};

export type PayloadResult =
  | { ok: true; payload: ProfilePayload }
  | { ok: false; step: 1; field: BodyField; message: string }
  | { ok: false; step: 2; lensKey: string; message: string };

export function buildProfilePayload(bodyDraft: BodyDraft, lensDrafts: LensDraft[]): PayloadResult {
  const body = bodyDraftToProfile(bodyDraft);
  if (!body.ok) return { ok: false, step: 1, field: body.field, message: body.message };

  const lenses: LensProfile[] = [];
  for (const draft of lensDrafts) {
    const result = draftToLens(draft);
    if (!result.ok) return { ok: false, step: 2, lensKey: draft.key, message: result.message };
    lenses.push(result.lens);
  }

  const { body: label, ...rest } = body.value;
  return { ok: true, payload: { body: label, structured: { ...rest, lenses } } };
}

function trimNumber(n: number): string {
  return String(Number(n.toFixed(2)));
}

// Confirm-step summary. Unknown parts are left out rather than shown as "?".
export function formatLensSpec(lens: LensProfile): string {
  const parts: string[] = [];
  const { focalMinMm: fMin, focalMaxMm: fMax, aperWide: aW, aperTele: aT } = lens;
  if (fMin !== null && fMax !== null) {
    parts.push(fMin === fMax ? `${trimNumber(fMin)}mm` : `${trimNumber(fMin)}–${trimNumber(fMax)}mm`);
  } else if (fMin !== null || fMax !== null) {
    parts.push(`${trimNumber((fMin ?? fMax) as number)}mm`);
  }
  if (aW !== null && aT !== null) {
    parts.push(aW === aT ? `f/${trimNumber(aW)}` : `f/${trimNumber(aW)}–${trimNumber(aT)}`);
  } else if (aW !== null || aT !== null) {
    parts.push(`f/${trimNumber((aW ?? aT) as number)}`);
  }
  if (lens.stabilised === true) parts.push("Stabilised");
  if (lens.stabilised === false) parts.push("Not stabilised");
  return parts.length > 0 ? parts.join(" · ") : "No details yet";
}

export function formatIsoSummary(value: Pick<BodyValue, "isoMode" | "isoValue" | "isoMax">): string {
  if (value.isoMode === "locked" && value.isoValue !== null) return `Locked at ISO ${value.isoValue}`;
  if (value.isoMode === "capped" && value.isoMax !== null) return `Auto, up to ISO ${value.isoMax}`;
  return "Auto";
}
