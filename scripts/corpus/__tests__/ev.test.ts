import { describe, it, expect } from "vitest";
import { settingsEv100, groundTruthEv100, groundTruthEv100OrNull } from "../ev";

describe("settingsEv100", () => {
  // The worked example from the spec. 1/125 is the nominal marking for a shutter
  // that is really 1/128, so the exact formula lands on 12.966 and the textbook
  // "EV 13" is that rounded — asserted both ways so neither reading drifts.
  it("puts f/8, 1/125, ISO 100 at EV 13", () => {
    expect(settingsEv100({ apertureN: 8, shutterSec: 1 / 125, iso: 100 })).toBeCloseTo(13, 1);
    expect(settingsEv100({ apertureN: 8, shutterSec: 1 / 128, iso: 100 })).toBe(13);
  });

  it("drops one stop of EV for every doubling of ISO", () => {
    const base = { apertureN: 8, shutterSec: 1 / 128 };
    expect(settingsEv100({ ...base, iso: 100 })).toBe(13);
    expect(settingsEv100({ ...base, iso: 200 })).toBe(12);
    expect(settingsEv100({ ...base, iso: 800 })).toBe(10);
  });

  it("gains one stop for every stop of aperture closed and every halving of time", () => {
    expect(settingsEv100({ apertureN: 11.3137, shutterSec: 1 / 128, iso: 100 })).toBeCloseTo(14, 3);
    expect(settingsEv100({ apertureN: 8, shutterSec: 1 / 256, iso: 100 })).toBe(14);
  });

  it("rejects non-positive settings rather than returning a nonsense EV", () => {
    expect(() => settingsEv100({ apertureN: 0, shutterSec: 1 / 128, iso: 100 })).toThrow(RangeError);
    expect(() => settingsEv100({ apertureN: 8, shutterSec: 0, iso: 100 })).toThrow(RangeError);
    expect(() => settingsEv100({ apertureN: 8, shutterSec: 1 / 128, iso: -1 })).toThrow(RangeError);
    expect(() => settingsEv100({ apertureN: NaN, shutterSec: 1 / 128, iso: 100 })).toThrow(RangeError);
  });
});

describe("groundTruthEv100 sign convention", () => {
  const eightAt125 = { apertureN: 8, shutterSec: 1 / 128, iso: 100 };

  // THE sign lock. judgedOffStops is SIGNED and NEGATIVE for an underexposed
  // frame: the camera metered for more light than was actually there, so the
  // true scene sits BELOW the settings EV.
  it("reads a frame judged one stop UNDER as one stop BELOW the settings EV", () => {
    expect(settingsEv100(eightAt125)).toBe(13);
    expect(groundTruthEv100(eightAt125, -1)).toBe(12);
  });

  it("leaves a correctly exposed frame at the settings EV", () => {
    expect(groundTruthEv100(eightAt125, 0)).toBe(13);
  });

  it("reads a frame judged one stop OVER as one stop ABOVE the settings EV", () => {
    expect(groundTruthEv100(eightAt125, 1)).toBe(14);
  });

  it("carries half-stop judgements", () => {
    expect(groundTruthEv100(eightAt125, -0.5)).toBe(12.5);
    expect(groundTruthEv100(eightAt125, 0.5)).toBe(13.5);
  });

  it("rejects a non-finite judgement", () => {
    expect(() => groundTruthEv100(eightAt125, NaN)).toThrow(RangeError);
  });
});

describe("groundTruthEv100OrNull", () => {
  it("returns null unless aperture, shutter and ISO are all present", () => {
    expect(groundTruthEv100OrNull({ apertureN: null, shutterSec: 1 / 128, iso: 100 }, 0)).toBeNull();
    expect(groundTruthEv100OrNull({ apertureN: 8, shutterSec: null, iso: 100 }, 0)).toBeNull();
    expect(groundTruthEv100OrNull({ apertureN: 8, shutterSec: 1 / 128, iso: null }, 0)).toBeNull();
    expect(groundTruthEv100OrNull({ apertureN: 8, shutterSec: 1 / 128, iso: 100 }, 0)).toBe(13);
  });
});
