import type { ExifExposure, RawExif } from "./types";

function positiveNumber(value: unknown): number | null {
  // ISOSpeedRatings is a multi-value tag in some files; the first entry is the one used.
  const v = Array.isArray(value) ? value[0] : value;
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null;
}

// Returns null unless aperture, shutter and ISO are all present — a partial
// reading can't produce an EV and must not be guessed at.
export function exifExposureFromRaw(raw: RawExif | null): ExifExposure | null {
  if (!raw) return null;
  const fNumber = positiveNumber(raw.FNumber);
  const exposureTimeS = positiveNumber(raw.ExposureTime);
  const iso = positiveNumber(raw.ISO ?? raw.ISOSpeedRatings);
  if (fNumber === null || exposureTimeS === null || iso === null) return null;

  // exifr names tag 0x9204 (ExposureBiasValue) "ExposureCompensation".
  const bias = raw.ExposureCompensation ?? raw.ExposureBiasValue;
  const exposureBiasEv = typeof bias === "number" && Number.isFinite(bias) ? bias : 0;

  return { fNumber, exposureTimeS, iso, exposureBiasEv };
}
