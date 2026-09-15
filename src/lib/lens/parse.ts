// Deterministic lens-string parser. Pure: no network, no model call.
//
// Confidence:
//   high    — focal length AND max aperture both read directly from the string
//   low     — focal range matched KNOWN_KIT_LENSES; apertures come from the table
//   unknown — anything else
//
// HARD RULE: confidence gates fabrication, not reading. A value read literally
// out of the string is always kept. An inferred value (kit-table apertures, a
// zoom's single aperture applied to both ends, "no marker means not
// stabilised") is only emitted when confidence allows it; otherwise the field
// is null. An unconfident guess must reach the UI as an empty field, never a
// plausible-looking number.
import type { Confidence, LensProfile } from "../contract/types";

type Brand =
  | "canon" | "nikon" | "sony" | "fujifilm"
  | "sigma" | "tamron" | "panasonic" | "olympus";

// Manufacturers whose lens names carry a stabilisation marker whenever the
// lens is stabilised. Only for these can a missing marker mean "not stabilised".
const BRAND_PATTERNS: [Brand, RegExp][] = [
  ["canon", /\bcanon\b|\b(?:EF-S|EF-M|EF|RF-S|RF)\b/i],
  ["nikon", /\bnikon\b|\bnikkor\b|\bAF-[SP]\b/i],
  ["sony", /\bsony\b|\bFE\b|\bGM\b/],
  ["fujifilm", /\bfuji(?:film|non)?\b|\bX[FC]\b/i],
  ["sigma", /\bsigma\b/i],
  ["tamron", /\btamron\b/i],
  ["panasonic", /\b(?:panasonic|lumix)\b/i],
  ["olympus", /\b(?:olympus|zuiko)\b|\bom[- ]system\b/i],
];

// Codes are case-sensitive so ordinary words ("is", "os") never match.
const STAB_CODE = "(?:IS|VR|OSS|OIS|VC|OS)";
const STAB_RE = new RegExp(
  `\\b${STAB_CODE}\\b|\\bO\\.I\\.S\\.?|\\b[Ss]tabili[sz](?:ed|ation|er)\\b`
);
const NEGATED_STAB_RE = new RegExp(
  `\\b(?:[Nn]on|NON|[Nn]o|NO|[Ww]ithout)[- ]${STAB_CODE}\\b|\\b(?:not|non|un)[- ]?stabili[sz]ed\\b`
);
const STAB_STOPS_RE = /(\d(?:\.\d)?)\s*-?\s*stops?\b/i;

// f/1.8, f1.8, F4, f/3.5-5.6, F3.5-F5.6, 1:1.8, 1:3.5-5.6.
// The lookbehind stops "XF16-80mm" reading as f/16. "1:" needs a decimal or a
// range so macro ratios ("1:1", "1:2") are not read as apertures.
const APERTURE_RE =
  /(?<![A-Za-z0-9.])(?:[fF]\s?\/\s?|[fF](?=\d)|1:(?=\d{1,2}\.\d|\d{1,2}(?:\.\d{1,2})?\s*[-–—]))(\d{1,2}(?:\.\d{1,2})?)(?:\s*[-–—~]\s*(?:[fF]\s?\/\s?|[fF](?=\d))?(\d{1,2}(?:\.\d{1,2})?))?/;

// A leading letter is allowed because mount codes glue onto the number
// ("XF16-80mm", "EF50mm"); "mm" makes the read unambiguous.
const FOCAL_RANGE_MM_RE =
  /(?<![0-9.])(\d{1,4}(?:\.\d)?)\s*(?:mm)?\s*[-–—~]\s*(\d{1,4}(?:\.\d)?)\s*mm\b/i;
const FOCAL_PRIME_MM_RE = /(?<![0-9.\-–—~])(\d{1,4}(?:\.\d)?)\s*mm\b/i;
// No "mm": integers only, tighter bounds, and min < max, so model numbers
// like "Helios 44-2" never read as a focal range.
const FOCAL_RANGE_BARE_RE = /(?<![A-Za-z0-9.\/:])(\d{1,4})\s*[-–—]\s*(\d{1,4})(?![A-Za-z0-9.])/;

const APERTURE_MIN = 0.7;
const APERTURE_MAX = 32;
const FOCAL_MAX_MM = 2000;
const BARE_FOCAL_MIN_MM = 6;
const BARE_FOCAL_MAX_MM = 1200;

type KitLens = {
  focalMinMm: number;
  focalMaxMm: number;
  aperWide: number;
  aperTele: number;
  brand?: Brand;
};

// Brand-specific rows first; a row without `brand` applies to any brand that
// has no specific row for the same range. Ranges whose aperture differs
// across makers (55-200, 70-300, 24-105) are deliberately absent.
const KNOWN_KIT_LENSES: KitLens[] = [
  { focalMinMm: 18, focalMaxMm: 55, aperWide: 2.8, aperTele: 4, brand: "fujifilm" },
  { focalMinMm: 16, focalMaxMm: 50, aperWide: 3.5, aperTele: 6.3, brand: "nikon" },
  { focalMinMm: 16, focalMaxMm: 50, aperWide: 3.5, aperTele: 5.6, brand: "sony" },
  { focalMinMm: 15, focalMaxMm: 45, aperWide: 3.5, aperTele: 5.6, brand: "fujifilm" },
  { focalMinMm: 28, focalMaxMm: 70, aperWide: 3.5, aperTele: 5.6, brand: "sony" },
  { focalMinMm: 18, focalMaxMm: 55, aperWide: 3.5, aperTele: 5.6 },
  { focalMinMm: 18, focalMaxMm: 135, aperWide: 3.5, aperTele: 5.6 },
  { focalMinMm: 18, focalMaxMm: 140, aperWide: 3.5, aperTele: 5.6 },
  { focalMinMm: 55, focalMaxMm: 250, aperWide: 4, aperTele: 5.6 },
  { focalMinMm: 14, focalMaxMm: 42, aperWide: 3.5, aperTele: 5.6 },
  { focalMinMm: 12, focalMaxMm: 32, aperWide: 3.5, aperTele: 5.6 },
];

type ApertureRead = { wide: number; tele: number | null; index: number; length: number };
type FocalRead = { min: number; max: number };

function detectBrand(text: string): Brand | null {
  for (const [brand, re] of BRAND_PATTERNS) {
    if (re.test(text)) return brand;
  }
  return null;
}

function isApertureValue(n: number): boolean {
  return Number.isFinite(n) && n >= APERTURE_MIN && n <= APERTURE_MAX;
}

function readAperture(text: string): ApertureRead | null {
  const m = APERTURE_RE.exec(text);
  if (!m) return null;
  const wide = Number(m[1]);
  const tele = m[2] === undefined ? null : Number(m[2]);
  if (!isApertureValue(wide)) return null;
  if (tele !== null && (!isApertureValue(tele) || tele < wide)) return null;
  return { wide, tele, index: m.index, length: m[0].length };
}

function readFocal(text: string): FocalRead | null {
  const range = FOCAL_RANGE_MM_RE.exec(text);
  if (range) {
    const min = Number(range[1]);
    const max = Number(range[2]);
    return min > 0 && max > min && max <= FOCAL_MAX_MM ? { min, max } : null;
  }

  const prime = FOCAL_PRIME_MM_RE.exec(text);
  if (prime) {
    const mm = Number(prime[1]);
    return mm > 0 && mm <= FOCAL_MAX_MM ? { min: mm, max: mm } : null;
  }

  const bare = FOCAL_RANGE_BARE_RE.exec(text);
  if (bare) {
    const min = Number(bare[1]);
    const max = Number(bare[2]);
    if (min >= BARE_FOCAL_MIN_MM && max > min && max <= BARE_FOCAL_MAX_MM) {
      return { min, max };
    }
  }
  return null;
}

function lookupKitLens(focal: FocalRead, brand: Brand | null): KitLens | null {
  const sameRange = KNOWN_KIT_LENSES.filter(
    (k) => k.focalMinMm === focal.min && k.focalMaxMm === focal.max
  );
  return (
    sameRange.find((k) => k.brand !== undefined && k.brand === brand) ??
    sameRange.find((k) => k.brand === undefined) ??
    null
  );
}

function readStabilised(
  text: string,
  brand: Brand | null,
  confidence: Confidence
): boolean | null {
  if (NEGATED_STAB_RE.test(text)) return false;
  if (STAB_RE.test(text)) return true;
  // A missing marker only means "not stabilised" on a fully-read name from a
  // maker that always marks stabilisation. Otherwise it stays unknown.
  if (confidence === "high" && brand !== null) return false;
  return null;
}

export function parseLensString(input: string): LensProfile {
  const label = input;
  const text = typeof input === "string" ? input : "";
  const brand = detectBrand(text);

  const aperture = readAperture(text);
  // Blank out the aperture so "f/3.5-5.6" is never re-read as a focal range.
  const focalText = aperture
    ? text.slice(0, aperture.index) +
      " ".repeat(aperture.length) +
      text.slice(aperture.index + aperture.length)
    : text;
  const focal = readFocal(focalText);

  let confidence: Confidence = "unknown";
  // Literal reads, kept whatever the confidence.
  let aperWide: number | null = aperture?.wide ?? null;
  let aperTele: number | null = aperture?.tele ?? null;

  if (focal && aperture) {
    const isPrime = focal.min === focal.max;
    // A single aperture on a zoom is a constant-aperture zoom by naming
    // convention. An aperture range on a prime is contradictory: not confident.
    if (!(isPrime && aperture.tele !== null && aperture.tele !== aperture.wide)) {
      confidence = "high";
      aperTele = aperture.tele ?? aperture.wide;
    }
  } else if (focal && !aperture) {
    const kit = lookupKitLens(focal, brand);
    if (kit) {
      confidence = "low";
      aperWide = kit.aperWide;
      aperTele = kit.aperTele;
    }
  }

  const stabilised = readStabilised(text, brand, confidence);
  const stops = stabilised === true ? STAB_STOPS_RE.exec(text) : null;

  return {
    label,
    focalMinMm: focal?.min ?? null,
    focalMaxMm: focal?.max ?? null,
    aperWide,
    aperTele,
    stabilised,
    stabStops: stops ? Number(stops[1]) : null,
    confidence,
  };
}

// Marked f-numbers for third stops: index k is 2^((k - THIRD_STOP_OFFSET) / 6).
const THIRD_STOP_OFFSET = 3;
const THIRD_STOP_LABELS = [
  0.7, 0.8, 0.9,
  1, 1.1, 1.2, 1.4, 1.6, 1.8, 2, 2.2, 2.5, 2.8, 3.2, 3.5,
  4, 4.5, 5, 5.6, 6.3, 7.1, 8, 9, 10, 11, 13, 14, 16, 18, 20, 22,
  25, 29, 32,
];

// Rounds to the nearest third stop that is narrower than or equal to `fNumber`
// (never wider), returned as the marked value (f/5.0, not f/5.04).
function toNarrowerThirdStop(fNumber: number): number {
  // Epsilon keeps a value sitting exactly on a third stop from rounding up.
  const k = Math.ceil(6 * Math.log2(fNumber) - 1e-9) + THIRD_STOP_OFFSET;
  if (k >= 0 && k < THIRD_STOP_LABELS.length) return THIRD_STOP_LABELS[k];
  return Math.round(2 ** ((k - THIRD_STOP_OFFSET) / 6) * 10) / 10;
}

// Max aperture at a given focal length. log2(f-number) is interpolated
// linearly against log2(focal length), then rounded to the nearest NARROWER
// third stop so a mid-zoom value is never wider than the lens can reach.
// Variable-aperture zooms close down fastest at the wide end, which linear-mm
// interpolation understates. Clamped to the endpoints outside the range.
export function apertureAtFocal(lens: LensProfile, focalMm: number): number | null {
  const { focalMinMm, focalMaxMm, aperWide, aperTele } = lens;
  if (aperWide === null) return null;
  if (focalMinMm !== null && focalMinMm === focalMaxMm) return aperWide;
  if (aperTele === null || focalMinMm === null || focalMaxMm === null) return null;
  if (aperWide === aperTele) return aperWide;
  if (!Number.isFinite(focalMm)) return null;
  if (focalMm <= focalMinMm) return aperWide;
  if (focalMm >= focalMaxMm) return aperTele;

  const t =
    (Math.log2(focalMm) - Math.log2(focalMinMm)) /
    (Math.log2(focalMaxMm) - Math.log2(focalMinMm));
  const wideStops = Math.log2(aperWide);
  const teleStops = Math.log2(aperTele);
  const exact = 2 ** (wideStops + t * (teleStops - wideStops));
  // Never report narrower than the lens's own long-end aperture.
  return Math.min(toNarrowerThirdStop(exact), aperTele);
}
