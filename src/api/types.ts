// Per arch-spec-v3.1.md §2.5. Inputs into the classifier — not part of the
// OrchestrateResult contract.
import type { BodyProfile, LensProfile } from "../lib/contract/types";
import type { ExifExposure, Histogram } from "../lib/exposure/types";

// Legacy free-text profile shape, still served by /api/camera-profile.
export type CameraProfile = {
  body: string | null;
  lenses: string[] | null;
  flash: string | null;
  notes: string | null;
};

// Structured profile the exposure ladder consumes.
export type GearProfile = {
  body: BodyProfile;
  lenses: LensProfile[];
};

export type PriorContext = {
  user_msg: string;
  assistant_summary: string;
};

// A photo of the scene, prepared client-side by src/lib/image/prepare.ts.
// exif is null when the file carried no usable exposure tags.
export type ImageInput = {
  jpegBase64: string;
  exif: ExifExposure | null;
  rawExifFlags: { hdrSuspect: boolean };
  histogram: Histogram;
};
