import { describe, expect, it } from "vitest";
import type { LensProfile } from "../../contract/types";
import { apertureAtFocal, parseLensString } from "../parse";

function expectAllNumericNull(lens: LensProfile) {
  expect(lens.focalMinMm).toBeNull();
  expect(lens.focalMaxMm).toBeNull();
  expect(lens.aperWide).toBeNull();
  expect(lens.aperTele).toBeNull();
  expect(lens.stabStops).toBeNull();
}

describe("parseLensString — required cases", () => {
  it("Canon RF 50mm f/1.8 STM → prime, f/1.8, not stabilised, high", () => {
    const lens = parseLensString("Canon RF 50mm f/1.8 STM");
    expect(lens).toEqual({
      label: "Canon RF 50mm f/1.8 STM",
      focalMinMm: 50,
      focalMaxMm: 50,
      aperWide: 1.8,
      aperTele: 1.8,
      stabilised: false,
      stabStops: null,
      confidence: "high",
    });
  });

  it("18-55 kit → 18/55, f/3.5-5.6 from kit table, low", () => {
    const lens = parseLensString("18-55 kit");
    expect(lens.focalMinMm).toBe(18);
    expect(lens.focalMaxMm).toBe(55);
    expect(lens.aperWide).toBe(3.5);
    expect(lens.aperTele).toBe(5.6);
    expect(lens.confidence).toBe("low");
    expect(lens.label).toBe("18-55 kit");
  });

  it("Sony 24-70mm f/2.8 GM II → 24/70, constant f/2.8, high", () => {
    const lens = parseLensString("Sony 24-70mm f/2.8 GM II");
    expect(lens.focalMinMm).toBe(24);
    expect(lens.focalMaxMm).toBe(70);
    expect(lens.aperWide).toBe(2.8);
    expect(lens.aperTele).toBe(2.8);
    expect(lens.confidence).toBe("high");
  });

  it("Tamron 18-400 VC → focal range kept as read, no apertures, stabilised, unknown", () => {
    const lens = parseLensString("Tamron 18-400 VC");
    // Read literally from the string, so kept despite unknown confidence.
    expect(lens.focalMinMm).toBe(18);
    expect(lens.focalMaxMm).toBe(400);
    // Not in the string and not a known kit lens, so never inferred.
    expect(lens.aperWide).toBeNull();
    expect(lens.aperTele).toBeNull();
    expect(lens.stabStops).toBeNull();
    expect(lens.stabilised).toBe(true);
    expect(lens.confidence).toBe("unknown");
  });

  it("Helios 44-2 → every numeric null, unknown", () => {
    const lens = parseLensString("Helios 44-2");
    expectAllNumericNull(lens);
    expect(lens.stabilised).toBeNull();
    expect(lens.confidence).toBe("unknown");
    expect(lens.label).toBe("Helios 44-2");
  });

  it('"" → every numeric null, unknown', () => {
    const lens = parseLensString("");
    expectAllNumericNull(lens);
    expect(lens.stabilised).toBeNull();
    expect(lens.confidence).toBe("unknown");
    expect(lens.label).toBe("");
  });
});

describe("parseLensString — hard rule and parsing edges", () => {
  it.each(["nifty fifty", "my zoom lens", "Z 50"])(
    "%s → unknown with every numeric null",
    (input) => {
      const lens = parseLensString(input);
      expect(lens.confidence).toBe("unknown");
      expectAllNumericNull(lens);
    }
  );

  it("keeps a read focal length but infers no aperture when confidence is unknown", () => {
    const prime = parseLensString("50mm");
    expect(prime.focalMinMm).toBe(50);
    expect(prime.focalMaxMm).toBe(50);
    expect(prime.aperWide).toBeNull();
    expect(prime.aperTele).toBeNull();
    expect(prime.confidence).toBe("unknown");

    const zoom = parseLensString("70-300");
    expect(zoom.focalMinMm).toBe(70);
    expect(zoom.focalMaxMm).toBe(300);
    expect(zoom.aperWide).toBeNull();
    expect(zoom.aperTele).toBeNull();
    expect(zoom.confidence).toBe("unknown");
  });

  it("keeps a read aperture but does not copy it to the tele end without a focal length", () => {
    const lens = parseLensString("f/1.8");
    expect(lens.aperWide).toBe(1.8);
    expect(lens.aperTele).toBeNull();
    expect(lens.focalMinMm).toBeNull();
    expect(lens.focalMaxMm).toBeNull();
    expect(lens.confidence).toBe("unknown");
  });

  it("does not coerce stabilised to false without a known maker", () => {
    expect(parseLensString("35mm f/1.4").stabilised).toBeNull();
  });

  it("reads variable aperture ranges and stabilisation markers", () => {
    const lens = parseLensString("Nikon AF-S DX 18-140mm f/3.5-5.6G ED VR");
    expect(lens.focalMinMm).toBe(18);
    expect(lens.focalMaxMm).toBe(140);
    expect(lens.aperWide).toBe(3.5);
    expect(lens.aperTele).toBe(5.6);
    expect(lens.stabilised).toBe(true);
    expect(lens.confidence).toBe("high");
  });

  it('does not read "XF16-80mm" as f/16', () => {
    const lens = parseLensString("XF16-80mm F4 R OIS WR");
    expect(lens.focalMinMm).toBe(16);
    expect(lens.focalMaxMm).toBe(80);
    expect(lens.aperWide).toBe(4);
    expect(lens.aperTele).toBe(4);
    expect(lens.stabilised).toBe(true);
  });

  it("uses the brand-specific kit row where apertures differ", () => {
    const lens = parseLensString("Fujifilm XF 18-55");
    expect(lens.aperWide).toBe(2.8);
    expect(lens.aperTele).toBe(4);
    expect(lens.confidence).toBe("low");
  });

  it("reads 1: engraving notation", () => {
    const lens = parseLensString("EF 50mm 1:1.8 II");
    expect(lens.aperWide).toBe(1.8);
    expect(lens.focalMinMm).toBe(50);
    expect(lens.confidence).toBe("high");
  });

  it("treats a negated marker as not stabilised", () => {
    expect(parseLensString("Canon EF 70-200mm f/4L non-IS").stabilised).toBe(false);
  });
});

describe("apertureAtFocal", () => {
  const kit = parseLensString("18-55 kit");

  it("returns aperTele at the long end", () => {
    expect(apertureAtFocal(kit, 55)).toBe(5.6);
  });

  it("returns aperWide at the short end", () => {
    expect(apertureAtFocal(kit, 18)).toBe(3.5);
  });

  it("returns a value strictly between the endpoints mid-range", () => {
    const f = apertureAtFocal(kit, 35);
    expect(f).not.toBeNull();
    expect(f!).toBeGreaterThan(3.5);
    expect(f!).toBeLessThan(5.6);
  });

  it("never returns wider than the lens can reach mid-zoom (35mm on 18-55 is >= f/4.5)", () => {
    expect(apertureAtFocal(kit, 35)!).toBeGreaterThanOrEqual(4.5);
  });

  it("rounds mid-zoom values to the nearest narrower marked third stop", () => {
    // log-focal interpolation gives ~f/4.63 at 35mm; the next narrower third stop is f/5.0.
    expect(apertureAtFocal(kit, 35)).toBe(5);
  });

  it("never exceeds the long-end aperture after rounding", () => {
    const lens = { ...kit, aperTele: 5.9 };
    expect(apertureAtFocal(lens, 54)!).toBeLessThanOrEqual(5.9);
  });

  it("clamps outside the range", () => {
    expect(apertureAtFocal(kit, 10)).toBe(3.5);
    expect(apertureAtFocal(kit, 200)).toBe(5.6);
  });

  it("returns aperWide for a prime at any focal", () => {
    const prime = parseLensString("Canon RF 50mm f/1.8 STM");
    expect(apertureAtFocal(prime, 85)).toBe(1.8);
  });

  it("returns null when an endpoint is unknown", () => {
    expect(apertureAtFocal(parseLensString("Tamron 18-400 VC"), 100)).toBeNull();
    expect(apertureAtFocal({ ...kit, aperTele: null }, 35)).toBeNull();
  });
});
