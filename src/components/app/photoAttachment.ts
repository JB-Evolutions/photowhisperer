// Pure helpers for the photo composer and response rendering. No DOM.
import type { PreparedImage } from "@/lib/image/prepare";
import { ImageTooLargeError, UnsupportedImageError } from "@/lib/image/errors";
import { MAX_INPUT_BYTES } from "@/lib/image/limits";
import { isHdrSuspect } from "@/lib/exposure/hdr";
import type { BodyProfile } from "@/lib/contract/types";
import type {
  ClientSettingsResponse,
  ExposureSettingsResponseOk,
  SettingsImagePayload,
} from "@/lib/settingsClient";

export type AttachmentErrorKind = "unsupported" | "too_large" | "too_large_prepared" | "unreadable";

export function attachmentErrorKind(err: unknown): AttachmentErrorKind {
  if (err instanceof UnsupportedImageError) return "unsupported";
  if (err instanceof ImageTooLargeError) return err.stage === "input" ? "too_large" : "too_large_prepared";
  // Duck-typed fallback in case the error crossed a realm boundary.
  if (err && typeof err === "object" && "code" in err) {
    const { code, stage } = err as { code?: unknown; stage?: unknown };
    if (code === "unsupported_image") return "unsupported";
    if (code === "image_too_large") return stage === "output" ? "too_large_prepared" : "too_large";
  }
  return "unreadable";
}

const MAX_INPUT_MB = Math.round(MAX_INPUT_BYTES / (1024 * 1024));

export const ATTACHMENT_ERROR_COPY: Record<AttachmentErrorKind, string> = {
  unsupported: "That file type won't open here. Try a JPEG, PNG or WebP photo.",
  too_large: `That photo is over ${MAX_INPUT_MB} MB. Try a smaller one.`,
  too_large_prepared: "That photo is still too large to send after resizing. Try another one.",
  unreadable: "Couldn't open that photo. Try another one.",
};

export function buildImagePayload(prepared: PreparedImage): SettingsImagePayload {
  return {
    jpegBase64: prepared.jpegBase64,
    thumbnailBase64: prepared.thumbnailBase64,
    exif: prepared.exif,
    rawExifFlags: { hdrSuspect: isHdrSuspect(prepared.rawExif) },
    histogram: prepared.histogram,
  };
}

// data: URIs, not blob: — the CSP img-src allows data: but not blob:.
export function jpegDataUri(base64: string): string {
  return `data:image/jpeg;base64,${base64}`;
}

function stopsPhrase(stops: number): string {
  if (stops < 0.75) return "under a stop";
  const n = Math.round(stops);
  return `about ${n} stop${n === 1 ? "" : "s"}`;
}

export function shortfallLine(
  shortfallStops: number | undefined,
  iso: number,
  isoMode: BodyProfile["isoMode"] | null,
): string | null {
  if (shortfallStops === undefined || !Number.isFinite(shortfallStops) || shortfallStops <= 0) return null;
  const lead =
    isoMode === "locked" ? `Locked at ISO ${iso}`
    : isoMode === "capped" ? `Capped at ISO ${iso}`
    : `Even at ISO ${iso}`;
  return `${lead}, this is ${stopsPhrase(shortfallStops)} darker than correct — the shot will be underexposed.`;
}

// Floor explanation and shortfall surface inside the existing assumptions
// panel — no new visual element. Deduped in case the route already included them.
export function responseAssumptions(
  response: Pick<ExposureSettingsResponseOk, "assumptions" | "floorExplain" | "shortfallStops" | "iso">,
  isoMode: BodyProfile["isoMode"] | null,
): string[] {
  const out = [...response.assumptions];
  const extra = [
    response.floorExplain?.trim() || null,
    shortfallLine(response.shortfallStops, response.iso, isoMode),
  ];
  for (const line of extra) {
    if (line && !out.includes(line)) out.push(line);
  }
  return out;
}

export const WIDEST_APERTURE_COPY = "widest your lens allows";

// prepareImage starts the moment a file is chosen; the promise travels with
// the attachment so a send made while it is still running can await it.
export type ComposerAttachment = {
  id: number;
  name: string;
  status: "preparing" | "ready" | "error";
  thumbnailSrc: string | null;
  errorKind: AttachmentErrorKind | null;
  promise: Promise<PreparedImage>;
};

// Client-only thread entry: a photo sent while still preparing failed to
// prepare, so no request was made.
export type PhotoFailedResponse = { status: "photo_failed"; kind: AttachmentErrorKind };

export type ThreadResponse = ClientSettingsResponse | PhotoFailedResponse;
