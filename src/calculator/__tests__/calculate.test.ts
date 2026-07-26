import { describe, it, expect } from "vitest";
import {
  calculateSettings,
  apertureWidenedWarning,
  SHAKE_AT_FLOOR_WARNING,
  MOTION_AT_FLOOR_WARNING,
} from "../calculate";
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
    // Old expectation (iso 12800, f/4) encoded the pre-ladder bug: aperture
    // locked at the f/5.6 default and ISO absorbed the entire deficit. The
    // corrected ladder widens the aperture toward the f/1.8 policy limit
    // first — here it stops at f/2 (isoIdeal already <=3200 there, no need
    // to go all the way to 1.8) — and only the leftover gap lands on ISO,
    // which is now 2 stops lower (3200 vs 12800).
    const r = calculateSettings(scene({ scene_ev: 5, motion_tier: "slow", support: "handheld", focal_length_mm: 35, creative_intent: "standard", white_balance: "tungsten" }));
    expect(r.iso).toBe(3200);
    expect(r.aperture).toBe("f/2");
    expect(r.shutter_speed).toBe("1/250");
    // f/2 is wider than f/2.8 on standard intent → shallow-DOF warning.
    // Identity-based, not a literal string: this stays correct across copy
    // changes since it compares against the same builder the implementation
    // calls. See test 21 below for the one place the actual wording is pinned.
    expect(r.warnings).toContain(apertureWidenedWarning(2.0));
    // At 35mm/slow, the motion floor (1/250) binds before the shake floor
    // (1/35) would — floorCause is "motion" here, not "shake" — and the
    // motion-floor warning fires unconditionally (unlike the shake-floor
    // warning, it isn't gated by the noise gate below).
    expect(r.warnings).toContain(MOTION_AT_FLOOR_WARNING);
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

  it("13: focal_length_assumed — assumption string present (handheld)", () => {
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
      "Assumed 50mm full-frame focal length (not specified); handheld shake floor derives from it."
    );
  });

  it("13b: focal_length_assumed — support-neutral string on tripod, no mention of handheld", () => {
    const r = calculateSettings({
      scene_ev: 15,
      motion_tier: "stationary",
      support: "tripod",
      focal_length_mm: 50,
      focal_length_assumed: true,
      creative_intent: "standard",
      white_balance: "daylight",
    });
    expect(r.assumptions).toContain("Assumed 50mm full-frame focal length (not specified).");
    expect(r.assumptions.some((a) => a.toLowerCase().includes("handheld"))).toBe(false);
  });

  it("17: 8mm handheld stationary — absolute shake-floor cap binds at 1/15, not 1/8", () => {
    const r = calculateSettings(scene({ scene_ev: -4, motion_tier: "stationary", support: "handheld", focal_length_mm: 8, creative_intent: "standard", white_balance: "daylight" }));
    expect(r.shutter_speed).toBe("1/15");
    expect(r.warnings).toContain(SHAKE_AT_FLOOR_WARNING);
  });

  it("18: 24mm handheld stationary — absolute cap does not bind, floors at 1/30, not 1/60", () => {
    const r = calculateSettings(scene({ scene_ev: -4, motion_tier: "stationary", support: "handheld", focal_length_mm: 24, creative_intent: "standard", white_balance: "daylight" }));
    expect(r.shutter_speed).toBe("1/30");
    expect(r.shutter_speed).not.toBe("1/60");
    // Negative case for the shake-warning noise gate: at 24mm the cap doesn't
    // bind and focal_length_assumed is false, so once that gate lands, the
    // shake floor is the "standard rule of thumb" case (not genuinely thin
    // margin) and must NOT warn.
    expect(r.warnings).not.toContain(SHAKE_AT_FLOOR_WARNING);
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

describe("ISO soft-cap / lens-limit note decoupling", () => {
  it("19: no lens clamp, iso lands at 3200 -> no ISO warning, no lens-limit note", () => {
    const r = calculateSettings(scene({ scene_ev: 6, motion_tier: "stationary", support: "handheld", focal_length_mm: 50, creative_intent: "standard", white_balance: "daylight", max_aperture: null }));
    expect(r.iso).toBe(3200);
    expect(r.aperture).toBe("f/5.6");
    expect(r.warnings.some((w) => w.includes("ISO 3200 needed"))).toBe(false);
    expect(r.warnings.some((w) => /lens/i.test(w))).toBe(false);
  });
});

describe("ISO-warning remedies — no bad advice to a tripod user already at the ceiling", () => {
  it("21: deep_dof + tripod + stationary + EV -6 — warning copy (locked): no tripod/longer-exposure advice, flash offered, grammar fixed", () => {
    const r = calculateSettings(scene({ scene_ev: -6, motion_tier: "stationary", support: "tripod", focal_length_mm: 24, creative_intent: "deep_dof", white_balance: "daylight" }));
    expect(r.iso).toBe(12800);
    expect(r.aperture).toBe("f/8");
    expect(r.warnings).toContain(
      "Scene darker than calculator can fully expose — ISO 12800 needed because the deep depth of field request holds the aperture at f/8. Image may be underexposed; add light, accept a shallower depth of field, or use flash."
    );
    expect(r.warnings).toHaveLength(1);
  });

  it("22: standard + tripod + slow motion + EV -6 — no tripod/longer-exposure advice (motion floor, not shake, binds)", () => {
    const r = calculateSettings(scene({ scene_ev: -6, motion_tier: "slow", support: "tripod", focal_length_mm: 24, creative_intent: "standard", white_balance: "daylight" }));
    const isoWarning = r.warnings.find((w) => w.startsWith("Scene darker"));
    expect(isoWarning).toBeDefined();
    expect(isoWarning).not.toMatch(/tripod/i);
    expect(isoWarning).not.toMatch(/longer exposure/i);
    expect(isoWarning).toMatch(/flash/i);
  });

  it("23: handheld + EV -4 — tripod and longer-exposure advice still present (negative control)", () => {
    const r = calculateSettings(scene({ scene_ev: -4, motion_tier: "stationary", support: "handheld", focal_length_mm: 50, creative_intent: "standard", white_balance: "daylight" }));
    const isoWarning = r.warnings.find((w) => w.startsWith("Scene darker"));
    expect(isoWarning).toBeDefined();
    expect(isoWarning).toMatch(/tripod/i);
    expect(isoWarning).toMatch(/longer exposure/i);
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
