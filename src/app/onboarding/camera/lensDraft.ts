// Editable lens rows for onboarding. Confidence is per field: a value read
// literally from the name is solid; a value the parser took from its kit table
// is a guess (dashed) until the user edits it; a null is empty and dashed.
// A plausible-looking number is never invented here.
import { parseLensString } from "@/lib/lens/parse";
import type { Confidence, LensProfile } from "@/lib/contract/types";

export type LensField = "focalMin" | "focalMax" | "aperWide" | "aperTele";
export type Border = "solid" | "dashed";

export type LensDraft = {
  key: string;
  label: string;
  // The label the fields were last parsed from — a blur re-parses only when
  // the label actually changed.
  parsedLabel: string;
  focalMin: string;
  focalMax: string;
  aperWide: string;
  aperTele: string;
  stabilised: boolean | null;
  stabStops: number | null;
  parserConfidence: Confidence;
  guessed: LensField[];
  edited: (LensField | "stabilised")[];
};

const FIELDS: LensField[] = ["focalMin", "focalMax", "aperWide", "aperTele"];

function fmt(n: number | null): string {
  return n === null ? "" : String(n);
}

function parsedFields(label: string) {
  const p = parseLensString(label);
  return {
    values: {
      focalMin: fmt(p.focalMinMm),
      focalMax: fmt(p.focalMaxMm),
      aperWide: fmt(p.aperWide),
      aperTele: fmt(p.aperTele),
    } satisfies Record<LensField, string>,
    stabilised: p.stabilised,
    stabStops: p.stabStops,
    confidence: p.confidence,
    // "low" means focal was read and apertures came from the kit table.
    guessed: p.confidence === "low" ? (["aperWide", "aperTele"] as LensField[]) : [],
  };
}

export function draftFromLabel(key: string, label: string): LensDraft {
  const p = parsedFields(label);
  return {
    key,
    label,
    parsedLabel: label,
    ...p.values,
    stabilised: p.stabilised,
    stabStops: p.stabStops,
    parserConfidence: p.confidence,
    guessed: p.guessed.filter((f) => p.values[f] !== ""),
    edited: [],
  };
}

// Re-parse after a label edit. Anything the user typed by hand survives.
export function reparseDraft(draft: LensDraft): LensDraft {
  if (draft.label === draft.parsedLabel) return draft;
  const p = parsedFields(draft.label);
  const next: LensDraft = {
    ...draft,
    parsedLabel: draft.label,
    parserConfidence: p.confidence,
    guessed: p.guessed.filter((f) => !draft.edited.includes(f) && p.values[f] !== ""),
  };
  for (const f of FIELDS) {
    if (!draft.edited.includes(f)) next[f] = p.values[f];
  }
  if (!draft.edited.includes("stabilised")) {
    next.stabilised = p.stabilised;
    next.stabStops = p.stabStops;
  }
  return next;
}

export function editField(draft: LensDraft, field: LensField, value: string): LensDraft {
  return {
    ...draft,
    [field]: value,
    guessed: draft.guessed.filter((f) => f !== field),
    edited: draft.edited.includes(field) ? draft.edited : [...draft.edited, field],
  };
}

export function setStabilised(draft: LensDraft, value: boolean | null): LensDraft {
  return {
    ...draft,
    stabilised: value,
    // Stops only mean something for a stabilised lens.
    stabStops: value === true ? draft.stabStops : null,
    edited: draft.edited.includes("stabilised") ? draft.edited : [...draft.edited, "stabilised"],
  };
}

export function fieldBorder(draft: LensDraft, field: LensField): Border {
  if (draft[field].trim() === "") return "dashed";
  return draft.guessed.includes(field) ? "dashed" : "solid";
}

export function stabilisedBorder(draft: LensDraft): Border {
  return draft.stabilised === null ? "dashed" : "solid";
}

export function hasGuesses(draft: LensDraft): boolean {
  return draft.guessed.length > 0;
}

type NumberRead = { ok: true; value: number | null } | { ok: false };

function readNumber(raw: string, { stripF = false } = {}): NumberRead {
  let s = raw.trim();
  if (stripF) s = s.replace(/^f\s*\/?\s*/i, "");
  if (s === "") return { ok: true, value: null };
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? { ok: true, value: n } : { ok: false };
}

export type DraftResult = { ok: true; lens: LensProfile } | { ok: false; message: string };

export function draftToLens(draft: LensDraft): DraftResult {
  const label = draft.label.trim();
  if (label === "") return { ok: false, message: "Give this lens a name." };

  const focalMin = readNumber(draft.focalMin);
  const focalMax = readNumber(draft.focalMax);
  if (!focalMin.ok || !focalMax.ok) return { ok: false, message: "Focal length needs to be a number in mm." };
  const aperWide = readNumber(draft.aperWide, { stripF: true });
  const aperTele = readNumber(draft.aperTele, { stripF: true });
  if (!aperWide.ok || !aperTele.ok) return { ok: false, message: "Aperture needs to be a number, like 2.8." };

  if (focalMin.value !== null && focalMin.value > 2000) return { ok: false, message: "Focal length looks too long — check the mm." };
  if (focalMax.value !== null && focalMax.value > 2000) return { ok: false, message: "Focal length looks too long — check the mm." };
  if (aperWide.value !== null && (aperWide.value < 0.7 || aperWide.value > 32)) {
    return { ok: false, message: "Aperture should be between f/0.7 and f/32." };
  }
  if (aperTele.value !== null && (aperTele.value < 0.7 || aperTele.value > 32)) {
    return { ok: false, message: "Aperture should be between f/0.7 and f/32." };
  }
  if (focalMin.value !== null && focalMax.value !== null && focalMax.value < focalMin.value) {
    return { ok: false, message: "The long end can't be shorter than the short end." };
  }
  if (aperWide.value !== null && aperTele.value !== null && aperTele.value < aperWide.value) {
    return { ok: false, message: "The long-end aperture can't be wider than the short-end one." };
  }

  const complete = [focalMin, focalMax, aperWide, aperTele].every((r) => r.value !== null);
  const confidence: Confidence =
    draft.guessed.length > 0 ? "low" : complete ? "high" : "unknown";

  return {
    ok: true,
    lens: {
      label,
      focalMinMm: focalMin.value,
      focalMaxMm: focalMax.value,
      aperWide: aperWide.value,
      aperTele: aperTele.value,
      stabilised: draft.stabilised,
      stabStops: draft.stabilised === true ? draft.stabStops : null,
      confidence,
    },
  };
}

export function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length || from === to) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}
