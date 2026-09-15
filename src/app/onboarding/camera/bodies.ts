// Crop factor by body, for the suggestion list only. Anything not listed —
// including every phone, whose "crop" depends on which lens is in use — is
// unknown (null). Never guessed from a partial match.
const CROP_FACTORS: Record<string, number> = {
  "canon r5": 1,
  "canon r6": 1,
  "canon r6 ii": 1,
  "canon 5d iv": 1,
  "canon 6d ii": 1,
  "canon r10": 1.6,
  "canon r7": 1.6,
  "canon 90d": 1.6,
  "sony a7 iv": 1,
  "sony a7 iii": 1,
  "sony a7r iv": 1,
  "sony a7c": 1,
  "sony a6700": 1.5,
  "sony a6400": 1.5,
  "sony a6000": 1.5,
  "nikon z9": 1,
  "nikon z8": 1,
  "nikon z7 ii": 1,
  "nikon z6 ii": 1,
  "nikon z5": 1,
  "nikon d850": 1,
  "nikon d780": 1,
  "nikon z50": 1.5,
  "fujifilm x-t5": 1.5,
  "fujifilm x-t4": 1.5,
  "fujifilm x-h2": 1.5,
  "fujifilm x-s20": 1.5,
  "fujifilm x100v": 1.5,
};

function normalise(body: string): string {
  return body.trim().toLowerCase().replace(/\s+/g, " ");
}

export function cropFactorForBody(body: string): number | null {
  return CROP_FACTORS[normalise(body)] ?? null;
}
