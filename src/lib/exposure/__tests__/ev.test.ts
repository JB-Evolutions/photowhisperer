import { describe, it, expect } from "vitest";
import { LIGHT_CONDITION_EV, type LightCondition } from "@/lib/contract/types";
import {
  evFromExif,
  resolveSceneEv,
  SUBJECT_OFFSET_STOPS,
  HDR_ASSUMPTION,
  SCENE_CLASS_ASSUMPTION,
  type ResolveSceneEvInput,
} from "../ev";
import type { ExifExposure, SubjectExposureVerdict } from "../types";

// f/8, 1/125s, ISO 100 → log2(64 × 125) = log2(8000) ≈ 12.966
const EXIF: ExifExposure = { fNumber: 8, exposureTimeS: 1 / 125, iso: 100, exposureBiasEv: 0 };
const EXIF_EV = Math.log2(8000);

// Clipping on both sides so the cross-check supports any verdict.
const CLIPPED_BOTH = { shadowClipPct: 5, highlightClipPct: 5 };

const BASE: ResolveSceneEvInput = {
  exif: EXIF,
  verdict: "metered_on_subject",
  histogram: CLIPPED_BOTH,
  hdrSuspect: false,
  condition: null,
};

describe("evFromExif", () => {
  it("f/1.78, 1/120s, ISO 320 → 6.89", () => {
    // log2(1.78² × 120) = log2(380.208) = 8.5707; log2(320/100) = 1.6781
    expect(evFromExif({ fNumber: 1.78, exposureTimeS: 1 / 120, iso: 320, exposureBiasEv: 0 })).toBeCloseTo(6.89, 2);
  });

  it("f/16, 1/100s, ISO 100 → 14.64 (sunny 16)", () => {
    // log2(256 × 100) = log2(25600) = 8 + 6.6439
    expect(evFromExif({ fNumber: 16, exposureTimeS: 1 / 100, iso: 100, exposureBiasEv: 0 })).toBeCloseTo(14.64, 2);
  });

  it("f/4, 1/15s, ISO 1600 → 3.91", () => {
    // log2(16 × 15) = log2(240) = 7.9069; log2(1600/100) = 4
    expect(evFromExif({ fNumber: 4, exposureTimeS: 1 / 15, iso: 1600, exposureBiasEv: 0 })).toBeCloseTo(3.91, 2);
  });

  it("ignores exposureBiasEv — it returns the settings EV only", () => {
    expect(evFromExif({ ...EXIF, exposureBiasEv: -3 })).toBeCloseTo(EXIF_EV, 10);
  });

  it.each([
    ["fNumber 0", { ...EXIF, fNumber: 0 }],
    ["negative fNumber", { ...EXIF, fNumber: -2.8 }],
    ["exposureTimeS 0", { ...EXIF, exposureTimeS: 0 }],
    ["NaN exposureTimeS", { ...EXIF, exposureTimeS: Number.NaN }],
    ["Infinity iso", { ...EXIF, iso: Number.POSITIVE_INFINITY }],
    ["negative iso", { ...EXIF, iso: -100 }],
  ])("throws on %s instead of returning 0", (_label, input) => {
    expect(() => evFromExif(input)).toThrow(RangeError);
  });
});

describe("resolveSceneEv — exposure bias sign", () => {
  it("exposureBiasEv of -1 lowers scene_ev by 1; +1 raises it by 1", () => {
    // At -1 EC the camera gave one stop less exposure than the meter asked for,
    // so the settings sit one stop above the metered reading: scene = settings + bias.
    const noBias = resolveSceneEv(BASE).scene_ev!;
    const minusOne = resolveSceneEv({ ...BASE, exif: { ...EXIF, exposureBiasEv: -1 } }).scene_ev!;
    expect(minusOne - noBias).toBeCloseTo(-1, 10);

    // At +1 EC the camera gave one stop more, so the settings sit one stop below.
    const plusOne = resolveSceneEv({ ...BASE, exif: { ...EXIF, exposureBiasEv: 1 } }).scene_ev!;
    expect(plusOne - noBias).toBeCloseTo(1, 10);
  });

  it("the same scene shot at -1 EC has settings EV one higher, and resolves back to the metered EV", () => {
    // Metered at f/8 1/125 ISO 100 (EV 12.97). At -1 EC the camera halves the
    // exposure: f/8 1/250 → settings EV 13.97.
    const underexposed: ExifExposure = { fNumber: 8, exposureTimeS: 1 / 250, iso: 100, exposureBiasEv: -1 };
    expect(evFromExif(underexposed) - EXIF_EV).toBeCloseTo(1, 10);
    expect(resolveSceneEv({ ...BASE, exif: underexposed }).scene_ev).toBeCloseTo(EXIF_EV, 10);
  });
});

describe("resolveSceneEv — tier 1 (exif)", () => {
  it.each<[SubjectExposureVerdict, number]>([
    ["subject_much_darker", -2],
    ["subject_slightly_darker", -1],
    ["metered_on_subject", 0],
    ["subject_slightly_brighter", 1],
    ["subject_much_brighter", 2],
  ])("%s shifts scene_ev by %d", (verdict, stops) => {
    expect(SUBJECT_OFFSET_STOPS[verdict]).toBe(stops);
    const result = resolveSceneEv({ ...BASE, verdict });
    expect(result.scene_ev! - EXIF_EV).toBeCloseTo(stops, 10);
    expect(result).toMatchObject({ tier: 1, source: "exif", assumption: null });
  });

  it("null verdict applies no offset", () => {
    expect(resolveSceneEv({ ...BASE, verdict: null }).scene_ev).toBeCloseTo(EXIF_EV, 10);
  });

  it("discards much_darker when shadows aren't clipped", () => {
    const r = resolveSceneEv({
      ...BASE,
      verdict: "subject_much_darker",
      histogram: { shadowClipPct: 0.9, highlightClipPct: 40 },
    });
    expect(r.scene_ev).toBeCloseTo(EXIF_EV, 10);
  });

  it("discards much_brighter when highlights aren't clipped", () => {
    const r = resolveSceneEv({
      ...BASE,
      verdict: "subject_much_brighter",
      histogram: { shadowClipPct: 40, highlightClipPct: 0.2 },
    });
    expect(r.scene_ev).toBeCloseTo(EXIF_EV, 10);
  });

  it("keeps a large correction at exactly 1.0% clipping", () => {
    const r = resolveSceneEv({
      ...BASE,
      verdict: "subject_much_darker",
      histogram: { shadowClipPct: 1.0, highlightClipPct: 0 },
    });
    expect(r.scene_ev! - EXIF_EV).toBeCloseTo(-2, 10);
  });

  it("never cross-checks a one-stop correction", () => {
    const none = { shadowClipPct: 0, highlightClipPct: 0 };
    expect(resolveSceneEv({ ...BASE, verdict: "subject_slightly_darker", histogram: none }).scene_ev! - EXIF_EV).toBeCloseTo(-1, 10);
    expect(resolveSceneEv({ ...BASE, verdict: "subject_slightly_brighter", histogram: none }).scene_ev! - EXIF_EV).toBeCloseTo(1, 10);
  });

  it("discards a large correction when there is no histogram to support it", () => {
    const r = resolveSceneEv({ ...BASE, verdict: "subject_much_brighter", histogram: null });
    expect(r.scene_ev).toBeCloseTo(EXIF_EV, 10);
  });

  it("hdrSuspect forces offset to 0 even with a strong, histogram-backed verdict", () => {
    const r = resolveSceneEv({ ...BASE, verdict: "subject_much_darker", hdrSuspect: true });
    expect(r.scene_ev).toBeCloseTo(EXIF_EV, 10);
    expect(r).toMatchObject({ tier: 1, source: "exif", assumption: HDR_ASSUMPTION });
  });

  it("exif wins over a stated condition", () => {
    expect(resolveSceneEv({ ...BASE, condition: "direct_sun" }).tier).toBe(1);
  });
});

describe("resolveSceneEv — tiers 2 and 3", () => {
  const NO_EXIF: ResolveSceneEvInput = { ...BASE, exif: null };

  it("outdoor condition without exif → tier 2 from the shared table", () => {
    expect(resolveSceneEv({ ...NO_EXIF, condition: "overcast" })).toEqual({
      scene_ev: LIGHT_CONDITION_EV.overcast,
      tier: 2,
      source: "scene_class",
      assumption: SCENE_CLASS_ASSUMPTION,
    });
  });

  it.each<LightCondition>(["indoor_window", "indoor_artificial", "indoor_dim", "candlelit"])(
    "%s never returns tier 2",
    (condition) => {
      const r = resolveSceneEv({ ...NO_EXIF, condition });
      expect(r.tier).toBe(3);
      expect(r.scene_ev).toBeNull();
    },
  );

  it("every non-indoor condition resolves at tier 2", () => {
    const indoor = new Set(["indoor_window", "indoor_artificial", "indoor_dim", "candlelit"]);
    for (const condition of Object.keys(LIGHT_CONDITION_EV) as LightCondition[]) {
      if (indoor.has(condition)) continue;
      expect(resolveSceneEv({ ...NO_EXIF, condition }).tier).toBe(2);
    }
  });

  it("tier 3 when exif and condition are both null", () => {
    expect(resolveSceneEv({ ...NO_EXIF, condition: null })).toEqual({
      scene_ev: null,
      tier: 3,
      source: "user_stated",
      assumption: null,
    });
  });
});
