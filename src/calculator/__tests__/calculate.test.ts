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
    motion_intent: "freeze",
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
    // Governed by MOTION_FLOORS.fast. At 200mm the motion floor binds before
    // the shake floor (1/200) would, so shutter tracks MOTION_FLOORS.fast
    // directly and ISO follows from it — if that constant moves, so do these.
    const r = calculateSettings(scene({ scene_ev: 13, motion_tier: "fast", support: "handheld", focal_length_mm: 200, creative_intent: "standard", white_balance: "cloudy" }));
    expect(r.iso).toBe(200);
    expect(r.aperture).toBe("f/5.6");
    expect(r.shutter_speed).toBe("1/500");
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
    // Aperture: the concession ladder widens from the f/5.6 default toward
    // the f/1.8 policy limit under ISO pressure, stopping at f/2 here (no
    // need to go further) — unaffected by this session's constant changes.
    // Shutter/ISO: governed by MOTION_FLOORS.slow. At 35mm/slow the motion
    // floor binds before the shake floor (1/35) would, so shutter tracks
    // MOTION_FLOORS.slow directly, and ISO is whatever solves for scene_ev=5
    // at f/2 and that shutter. If MOTION_FLOORS.slow moves, both move with it.
    const r = calculateSettings(scene({ scene_ev: 5, motion_tier: "slow", support: "handheld", focal_length_mm: 35, creative_intent: "standard", white_balance: "tungsten" }));
    expect(r.iso).toBe(1600);
    expect(r.aperture).toBe("f/2");
    expect(r.shutter_speed).toBe("1/125");
    // f/2 is wider than f/2.8 on standard intent → shallow-DOF warning.
    // Identity-based, not a literal string: this stays correct across copy
    // changes since it compares against the same builder the implementation
    // calls. See test 21 below for the one place the actual wording is pinned.
    expect(r.warnings).toContain(apertureWidenedWarning(2.0));
    // At 35mm/slow, the motion floor (MOTION_FLOORS.slow) binds before the
    // shake floor (1/35) would — floorCause is "motion" here, not "shake" —
    // and the motion-floor warning fires unconditionally (unlike the
    // shake-floor warning, it isn't gated by the noise gate below).
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
    // Flash ambient solve: tripod + stationary floors at
    // TRIPOD_LONG_EXPOSURE_LIMIT_S (30s), the drag cap pulls that to 1s,
    // and 1s is not faster than FLASH_SYNC_SAFE_SHUTTER_S so no sync clamp
    // applies. At f/5.6 (standard) and EV 8, solved ISO lands at 100 (the
    // floor), not 200.
    const r = calculateSettings(scene({ scene_ev: 8, motion_tier: "stationary", support: "tripod", focal_length_mm: 50, creative_intent: "standard", white_balance: "flash" }));
    expect(r.iso).toBe(100);
    expect(r.aperture).toBe("f/5.6");
    expect(r.shutter_speed).toBe("1/8");
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
      motion_intent: "freeze",
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
      motion_intent: "freeze",
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

describe("flash ambient solve", () => {
  it("24: ev=15, standard, 50mm, handheld", () => {
    const r = calculateSettings(scene({ scene_ev: 15, motion_tier: "stationary", support: "handheld", focal_length_mm: 50, creative_intent: "standard", white_balance: "flash" }));
    expect(r.iso).toBe(100);
    expect(r.aperture).toBe("f/16");
    expect(r.shutter_speed).toBe("1/125");
  });

  it("25: ev=6, standard, 50mm, handheld", () => {
    const r = calculateSettings(scene({ scene_ev: 6, motion_tier: "stationary", support: "handheld", focal_length_mm: 50, creative_intent: "standard", white_balance: "flash" }));
    expect(r.iso).toBe(800);
    expect(r.aperture).toBe("f/5.6");
    expect(r.shutter_speed).toBe("1/60");
  });

  it("26: ev=15, shallow_dof, 85mm, handheld", () => {
    const r = calculateSettings(scene({ scene_ev: 15, motion_tier: "stationary", support: "handheld", focal_length_mm: 85, creative_intent: "shallow_dof", white_balance: "flash" }));
    expect(r.iso).toBe(100);
    expect(r.aperture).toBe("f/16");
    expect(r.shutter_speed).toBe("1/125");
  });

  it("27: ev=2, deep_dof, 24mm, tripod", () => {
    const r = calculateSettings(scene({ scene_ev: 2, motion_tier: "stationary", support: "tripod", focal_length_mm: 24, creative_intent: "deep_dof", white_balance: "flash" }));
    expect(r.iso).toBe(800);
    expect(r.aperture).toBe("f/8");
    expect(r.shutter_speed).toBe('1"');
  });

  it("28: ev=6, shallow_dof, 50mm, handheld, max_aperture 4", () => {
    const r = calculateSettings(scene({ scene_ev: 6, motion_tier: "stationary", support: "handheld", focal_length_mm: 50, creative_intent: "shallow_dof", white_balance: "flash", max_aperture: 4 }));
    expect(r.iso).toBe(800);
    expect(r.aperture).toBe("f/4");
    expect(r.shutter_speed).toBe("1/60");
  });
});

describe("ISO soft-cap / lens-limit note decoupling", () => {
  it("19: no lens clamp, iso lands at 1600 -> no ISO warning, no lens-limit note", () => {
    // Governed by ISO_SOFT_CAP. The raw ISO solve at f/5.6 exceeds
    // ISO_SOFT_CAP, so the concession ladder widens the aperture one stop
    // (f/5.6 -> f/4) before settling — that's the aperture change below, not
    // a lens or motion effect. If ISO_SOFT_CAP moves, the settled iso/aperture
    // pair moves with it.
    const r = calculateSettings(scene({ scene_ev: 6, motion_tier: "stationary", support: "handheld", focal_length_mm: 50, creative_intent: "standard", white_balance: "daylight", max_aperture: null }));
    expect(r.iso).toBe(1600);
    expect(r.aperture).toBe("f/4");
    expect(r.warnings.some((w) => w.includes("ISO 1600 needed"))).toBe(false);
    expect(r.warnings.some((w) => /lens/i.test(w))).toBe(false);
    // No widened-aperture warning either: Step 12 only fires on standard
    // intent when aperture < 2.8, and f/4 doesn't cross that threshold. This
    // scene's silence on that front is deliberate, not an assertion gap.
    expect(r.warnings).toHaveLength(0);
  });
});

describe("ISO-warning remedies — no bad advice to a tripod user already at the ceiling", () => {
  it("21: deep_dof + tripod + stationary + EV -6 — warning copy (locked): aperture widens under ISO pressure, no tripod/longer-exposure advice", () => {
    // Governed by DEEP_DOF_WIDE_LIMIT. deep_dof is no longer absolutely
    // pinned at f/8 — the concession ladder now widens it same as any other
    // intent, capped at DEEP_DOF_WIDE_LIMIT instead of riding ISO all the way
    // to ISO_MAX. That's why aperture lands at f/4 and ISO is 2 stops lower
    // than the old pinned-f/8 behavior (12800 -> 3200), and why the ISO
    // warning is no longer the "Scene darker..."/underexposed form: the
    // widened aperture keeps the solved ISO under the ISO_MAX ceiling.
    const r = calculateSettings(scene({ scene_ev: -6, motion_tier: "stationary", support: "tripod", focal_length_mm: 24, creative_intent: "deep_dof", white_balance: "daylight" }));
    expect(r.iso).toBe(3200);
    expect(r.aperture).toBe("f/4");
    expect(r.warnings).toContain(
      "ISO 3200 needed because the deep depth of field request holds the aperture at f/4; add light or accept a shallower depth of field."
    );
    // The widened-deep_dof warning must not suggest a tripod when the scene
    // is already tripod-mounted (often already at the calculator's own
    // TRIPOD_LONG_EXPOSURE_LIMIT_S ceiling) — see the matching gate in
    // calculate.ts's Step 12 deep_dof-widened warning.
    expect(r.warnings).toContain(
      "Depth of field opened to f/4 to keep ISO usable; front-to-back sharpness will be narrower than requested."
    );
    expect(r.warnings).toHaveLength(2);
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
