import type { RawExif } from "./types";

// EXIF SceneCaptureType 3 = "Night scene".
const SCENE_CAPTURE_NIGHT = 3;
// EXIF CompositeImage: 2 = general composite, 3 = composite captured while shooting.
const COMPOSITE_VALUES = new Set([2, 3]);
// Handheld phones cannot hold 1/8s, so a longer reported time describes a fused stack.
const PHONE_MAX_SINGLE_FRAME_S = 0.125;

const PHONE_MAKES =
  /^(apple|google|samsung|xiaomi|redmi|poco|oneplus|huawei|honor|oppo|vivo|realme|motorola|nothing|fairphone)\b/i;

function numeric(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function isPhoneMake(make: unknown, model?: unknown): boolean {
  const m = text(make);
  // Samsung NX-series are dedicated cameras.
  if (/^samsung/i.test(m) && /^NX/i.test(text(model))) return false;
  if (PHONE_MAKES.test(m)) return true;
  // Sony makes both; Xperia model codes start XQ- or SO-.
  return /^sony/i.test(m) && /^(XQ-|SO-)/i.test(text(model));
}

export function isHdrSuspect(raw: RawExif | null): boolean {
  if (!raw) return false;

  const customRendered = numeric(raw.CustomRendered);
  if (customRendered !== null && customRendered !== 0) return true;

  const composite = numeric(raw.CompositeImage);
  if (composite !== null && COMPOSITE_VALUES.has(composite)) return true;

  if (numeric(raw.SceneCaptureType) === SCENE_CAPTURE_NIGHT) return true;

  const exposureTimeS = numeric(raw.ExposureTime);
  if (
    exposureTimeS !== null &&
    exposureTimeS > PHONE_MAX_SINGLE_FRAME_S &&
    isPhoneMake(raw.Make, raw.Model)
  ) {
    return true;
  }

  return false;
}
