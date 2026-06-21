import { describe, it, expect } from "vitest";
import { calculateSettings } from "../calculate";
import { formatAperture, formatShutter } from "../format";
import type { SceneInput } from "../types";

function scene(overrides: Partial<SceneInput> & Pick<SceneInput, "scene_ev" | "motion_tier" | "support" | "focal_length_mm" | "creative_intent" | "white_balance">): SceneInput {
  return {
    focal_length_assumed: false,
    ...overrides,
  };
}

describe("pure exposure correctness", () => {
  it("1: ev=15, stationary, handheld, 85mm, standard, daylight", () => {
    const r = calculateSettings(scene({ scene_ev: 15, motion_tier: "stationary", support: "handheld", focal_length_mm: 85, creative_intent: "standard", white_balance: "daylight" }));
    expect(r.iso).toBe(100);
    expect(r.aperture).toBe("f/5.6");
    expect(r.shutter_speed).toBe("1/1000");
  });

  it("2: ev=15, moderate, handheld, 50mm, standard, daylight", () => {
    const r = calculateSettings(scene({ scene_ev: 15, motion_tier: "moderate", support: "handheld", focal_length_mm: 50, creative_intent: "standard", white_balance: "daylight" }));
    expect(r.iso).toBe(100);
    expect(r.aperture).toBe("f/5.6");
    expect(r.shutter_speed).toBe("1/1000");
  });

  it("3: ev=15, very_fast, handheld, 400mm, standard, daylight", () => {
    const r = calculateSettings(scene({ scene_ev: 15, motion_tier: "very_fast", support: "handheld", focal_length_mm: 400, creative_intent: "standard", white_balance: "daylight" }));
    expect(r.iso).toBe(200);
    expect(r.aperture).toBe("f/5.6");
    expect(r.shutter_speed).toBe("1/2000");
  });

  it("4: ev=15, very_fast, handheld, 600mm, standard, daylight", () => {
    const r = calculateSettings(scene({ scene_ev: 15, motion_tier: "very_fast", support: "handheld", focal_length_mm: 600, creative_intent: "standard", white_balance: "daylight" }));
    expect(r.iso).toBe(200);
    expect(r.aperture).toBe("f/5.6");
    expect(r.shutter_speed).toBe("1/2000");
  });

  it("5: ev=13, fast, handheld, 200mm, standard, cloudy", () => {
    const r = calculateSettings(scene({ scene_ev: 13, motion_tier: "fast", support: "handheld", focal_length_mm: 200, creative_intent: "standard", white_balance: "cloudy" }));
    expect(r.iso).toBe(400);
    expect(r.aperture).toBe("f/5.6");
    expect(r.shutter_speed).toBe("1/1000");
  });

  it("6: ev=11, stationary, tripod, 24mm, deep_dof, cloudy", () => {
    const r = calculateSettings(scene({ scene_ev: 11, motion_tier: "stationary", support: "tripod", focal_length_mm: 24, creative_intent: "deep_dof", white_balance: "cloudy" }));
    expect(r.iso).toBe(100);
    expect(r.aperture).toBe("f/8");
    expect(r.shutter_speed).toBe("1/30");
  });

  it("7: ev=8, stationary, handheld, 50mm, standard, fluorescent", () => {
    const r = calculateSettings(scene({ scene_ev: 8, motion_tier: "stationary", support: "handheld", focal_length_mm: 50, creative_intent: "standard", white_balance: "fluorescent" }));
    expect(r.iso).toBe(800);
    expect(r.aperture).toBe("f/5.6");
    expect(r.shutter_speed).toBe("1/60");
  });

  it("8: ev=11, stationary, handheld, 50mm, standard, shade", () => {
    const r = calculateSettings(scene({ scene_ev: 11, motion_tier: "stationary", support: "handheld", focal_length_mm: 50, creative_intent: "standard", white_balance: "shade" }));
    expect(r.iso).toBe(100);
    expect(r.aperture).toBe("f/5.6");
    expect(r.shutter_speed).toBe("1/60");
  });

  it("9: ev=5, slow, handheld, 35mm, standard, tungsten", () => {
    const r = calculateSettings(scene({ scene_ev: 5, motion_tier: "slow", support: "handheld", focal_length_mm: 35, creative_intent: "standard", white_balance: "tungsten" }));
    expect(r.iso).toBe(12800);
    expect(r.aperture).toBe("f/4");
    expect(r.shutter_speed).toBe("1/250");
  });

  it("10: ev=15, stationary, handheld, 85mm, shallow_dof, daylight", () => {
    const r = calculateSettings(scene({ scene_ev: 15, motion_tier: "stationary", support: "handheld", focal_length_mm: 85, creative_intent: "shallow_dof", white_balance: "daylight" }));
    expect(r.iso).toBe(100);
    expect(r.aperture).toBe("f/2");
    expect(r.shutter_speed).toBe("1/8000");
  });
});

describe("edge cases", () => {
  it("11: flash override", () => {
    const r = calculateSettings(scene({ scene_ev: 8, motion_tier: "stationary", support: "tripod", focal_length_mm: 50, creative_intent: "standard", white_balance: "flash" }));
    expect(r.iso).toBe(200);
    expect(r.aperture).toBe("f/5.6");
    expect(r.shutter_speed).toBe("1/200");
    expect(r.color_temperature).toBe("5500K");
  });

  it("12: ev=-4, stationary, tripod — long exposure, no warnings", () => {
    const r = calculateSettings(scene({ scene_ev: -4, motion_tier: "stationary", support: "tripod", focal_length_mm: 24, creative_intent: "shallow_dof", white_balance: "daylight" }));
    const shutterSeconds = r.shutter_speed.endsWith('"')
      ? parseFloat(r.shutter_speed)
      : 1 / parseInt(r.shutter_speed.slice(2));
    expect(shutterSeconds).toBeGreaterThanOrEqual(4);
    expect(r.warnings).toHaveLength(0);
  });

  it("13: focal_length_assumed — assumption string present", () => {
    const r = calculateSettings({
      scene_ev: 15,
      motion_tier: "stationary",
      support: "handheld",
      focal_length_mm: 50,
      focal_length_assumed: true,
      creative_intent: "standard",
      white_balance: "daylight",
    });
    expect(r.assumptions).toContain(
      "Assumed 50mm full-frame focal length (handheld, not specified)."
    );
  });

  it("14: ev=-4, handheld — underexposure warning", () => {
    const r = calculateSettings(scene({ scene_ev: -4, motion_tier: "stationary", support: "handheld", focal_length_mm: 24, creative_intent: "standard", white_balance: "auto" }));
    expect(r.warnings.some((w) => w.toLowerCase().includes("underexposed") || w.toLowerCase().includes("darker"))).toBe(true);
  });

  it("15: flash + handheld + 600mm — sync shake warning", () => {
    const r = calculateSettings(scene({ scene_ev: 8, motion_tier: "stationary", support: "handheld", focal_length_mm: 600, creative_intent: "standard", white_balance: "flash" }));
    expect(r.warnings.some((w) => w.toLowerCase().includes("handheld") && w.toLowerCase().includes("shake"))).toBe(true);
  });

  it("16: auto white balance — color_temperature is null", () => {
    const r = calculateSettings(scene({ scene_ev: 15, motion_tier: "stationary", support: "handheld", focal_length_mm: 50, creative_intent: "standard", white_balance: "auto" }));
    expect(r.color_temperature).toBeNull();
  });
});

describe("format helpers", () => {
  it('formatAperture(5.6) → "f/5.6"', () => {
    expect(formatAperture(5.6)).toBe("f/5.6");
  });

  it('formatAperture(8) → "f/8"', () => {
    expect(formatAperture(8)).toBe("f/8");
  });

  it('formatShutter(1/500) → "1/500"', () => {
    expect(formatShutter(1 / 500)).toBe("1/500");
  });

  it('formatShutter(2) → "2""', () => {
    expect(formatShutter(2)).toBe('2"');
  });

  it('formatShutter(0.5) → "1/2"', () => {
    expect(formatShutter(0.5)).toBe("1/2");
  });
});
