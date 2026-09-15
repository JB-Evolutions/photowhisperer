import exifr from "exifr";
import type { RawExif } from "@/lib/exposure/types";

// Keys translated, values left numeric — isHdrSuspect and exifExposureFromRaw
// compare against raw EXIF codes, not exifr's English labels.
export const EXIFR_OPTIONS = {
  tiff: true,
  exif: true,
  gps: false,
  interop: false,
  ifd1: false,
  xmp: false,
  icc: false,
  iptc: false,
  jfif: false,
  ihdr: false,
  makerNote: false,
  userComment: false,
  translateKeys: true,
  translateValues: false,
  reviveValues: true,
  mergeOutput: true,
};

// Must be given the ORIGINAL File — anything drawn to canvas or re-encoded has
// already lost its EXIF. Returns null when nothing parses (e.g. screenshots,
// formats exifr doesn't read); never throws.
export async function readRawExif(file: Blob): Promise<RawExif | null> {
  try {
    const out: unknown = await exifr.parse(file, EXIFR_OPTIONS);
    if (!out || typeof out !== "object" || Object.keys(out).length === 0) return null;
    return out as RawExif;
  } catch {
    return null;
  }
}
