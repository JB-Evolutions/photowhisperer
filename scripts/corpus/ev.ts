// Ground-truth EV derivation for the corpus.
//
// DELIBERATELY INDEPENDENT of src/lib/exposure. evFromExif and resolveSceneEv are
// the code the eval harness exists to test; if ground truth were computed with
// them, every harness run would agree with them by construction and an error in
// either would be invisible. The formula below is written out from first
// principles here and must stay that way.
//
// No import from src/lib/exposure. No EV constants — LIGHT_CONDITION_EV is the
// only table of EV numbers in this project and it is not restated here.

export type TakenSettings = {
  apertureN: number;   // f-number, e.g. 8 for f/8
  shutterSec: number;  // exposure time in seconds, e.g. 0.008 for 1/125
  iso: number;         // ISO the frame was taken at
};

function requirePositive(name: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`settingsEv100: ${name} must be a positive finite number, got ${value}`);
  }
}

// EV of the settings the frame was actually taken at, normalised to ISO 100.
//
//   EV = log2(N^2 / t)             at the taken ISO
//   EV100 = EV - log2(ISO / 100)   normalising to ISO 100
//
// exposureBiasEv is NOT an input. Bias is already baked into N, t and ISO: a
// camera told to underexpose by a stop achieved that by changing one of the
// three, so adding the bias again would double-count it. Bias is recorded on
// the entry for audit, never summed.
export function settingsEv100(settings: TakenSettings): number {
  const { apertureN, shutterSec, iso } = settings;
  requirePositive("apertureN", apertureN);
  requirePositive("shutterSec", shutterSec);
  requirePositive("iso", iso);
  return Math.log2((apertureN * apertureN) / shutterSec) - Math.log2(iso / 100);
}

// Scene EV at ISO 100 — what the light actually was, as opposed to what the
// camera assumed it was.
//
// judgedOffStops is SIGNED and describes the FRAME, not the correction:
//   -1 = the frame came out one stop UNDERexposed
//    0 = the frame is correctly exposed
//   +1 = the frame came out one stop OVERexposed
//
// An underexposed frame means the camera metered for more light than was there,
// so the true scene sits BELOW the settings EV — hence a plain sum, not a
// subtraction. f/8, 1/128, ISO 100 judged one stop under: settings EV 13,
// scene EV 12.
export function groundTruthEv100(settings: TakenSettings, judgedOffStops: number): number {
  if (!Number.isFinite(judgedOffStops)) {
    throw new RangeError(`groundTruthEv100: judgedOffStops must be finite, got ${judgedOffStops}`);
  }
  return settingsEv100(settings) + judgedOffStops;
}

// Same derivation, tolerant of a partial EXIF read: returns null unless
// aperture, shutter and ISO are all present. A partial reading cannot produce
// an EV and must never be guessed at — those frames go to needs_labels for a
// meter reading instead.
export function groundTruthEv100OrNull(
  settings: { apertureN: number | null; shutterSec: number | null; iso: number | null },
  judgedOffStops: number,
): number | null {
  const { apertureN, shutterSec, iso } = settings;
  if (apertureN === null || shutterSec === null || iso === null) return null;
  return groundTruthEv100({ apertureN, shutterSec, iso }, judgedOffStops);
}
