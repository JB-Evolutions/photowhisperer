import { describe, it, expect } from "vitest";
import { solveExposure } from "../ladder";
import { computeShutterFloor } from "../shutterFloor";
import { apertureAtFocal } from "../../lib/lens/parse";
import {
  INTENT_STOPS,
  LIGHT_CONDITION_EV,
  type BodyProfile,
  type BrightnessIntent,
  type LensProfile,
  type LightCondition,
  type SubjectMotion,
  type Support,
} from "../../lib/contract/types";

const LIGHTS = Object.keys(LIGHT_CONDITION_EV) as LightCondition[];
const INTENTS = Object.keys(INTENT_STOPS) as BrightnessIntent[];
const MOTIONS: SubjectMotion[] = ["static", "slow", "walking", "fast"];
const SUPPORTS: Support[] = ["handheld", "tripod"];

const FULL_FRAME: BodyProfile = {
  label: "Full frame",
  cropFactor: 1,
  ibisStops: null,
  isoBase: 100,
  isoMode: "auto",
  isoValue: null,
  isoMax: null,
};

const FIFTY_PRIME: LensProfile = {
  label: "50mm f/1.8",
  focalMinMm: 50,
  focalMaxMm: 50,
  aperWide: 1.8,
  aperTele: 1.8,
  stabilised: false,
  stabStops: null,
  confidence: "high",
};

const KIT_ZOOM: LensProfile = {
  label: "18-55mm f/3.5-5.6",
  focalMinMm: 18,
  focalMaxMm: 55,
  aperWide: 3.5,
  aperTele: 5.6,
  stabilised: false,
  stabStops: null,
  confidence: "high",
};

const UNKNOWN_LENS: LensProfile = {
  label: "my lens",
  focalMinMm: null,
  focalMaxMm: null,
  aperWide: null,
  aperTele: null,
  stabilised: null,
  stabStops: null,
  confidence: "unknown",
};

describe("exposure ladder", () => {
  it("50mm, cropFactor 1, static, no stabilisation → floor 1/50, ISO stays at isoBase until shutter reaches 1/50", () => {
    const base = { focalMm: 50, body: FULL_FRAME, lens: FIFTY_PRIME, motion: "static" as const, support: "handheld" as const };

    const floor = computeShutterFloor(base);
    expect(floor.floorS).toBeCloseTo(1 / 50, 12);
    expect(floor.setBy).toBe("reciprocal");
    expect(floor.explain).toBe("1/50 from the reciprocal rule at 50mm");

    for (const light of LIGHTS) {
      for (const intent of INTENTS) {
        const s = solveExposure({ ...base, sceneEv: LIGHT_CONDITION_EV[light], intent });
        if (s.iso > FULL_FRAME.isoBase) expect(s.shutterS).toBeCloseTo(1 / 50, 12);
        if (s.shutterS < 1 / 50) expect(s.iso).toBe(FULL_FRAME.isoBase);
      }
    }

    // Guard against a vacuous sweep: a dim scene must actually reach rung 3.
    const dim = solveExposure({ ...base, sceneEv: LIGHT_CONDITION_EV.indoor_dim, intent: "natural" });
    expect(dim.shutterS).toBeCloseTo(1 / 50, 12);
    expect(dim.iso).toBeGreaterThan(FULL_FRAME.isoBase);
  });

  it("same lens, motion walking → floor 1/125, ISO rises earlier, floor.explain names subject motion", () => {
    const base = { focalMm: 50, body: FULL_FRAME, lens: FIFTY_PRIME, support: "handheld" as const, sceneEv: LIGHT_CONDITION_EV.night_street, intent: "natural" as const };

    const walking = solveExposure({ ...base, motion: "walking" });
    expect(walking.floor.floorS).toBeCloseTo(1 / 125, 12);
    expect(walking.floor.setBy).toBe("subject_motion");
    expect(walking.floor.explain).toMatch(/walking/);

    // At this light the static floor (1/50) leaves shutter headroom, so ISO
    // stays at base; the walking floor (1/125) exhausts rung 2 first.
    const still = solveExposure({ ...base, motion: "static" });
    expect(still.iso).toBe(FULL_FRAME.isoBase);
    expect(walking.shutterS).toBeCloseTo(1 / 125, 12);
    expect(walking.iso).toBeGreaterThan(FULL_FRAME.isoBase);
  });

  it("18-55 at 55mm → aperture never wider than f/5.6", () => {
    expect(apertureAtFocal(KIT_ZOOM, 55)).toBe(5.6);

    for (const light of LIGHTS) {
      for (const intent of INTENTS) {
        for (const motion of MOTIONS) {
          for (const support of SUPPORTS) {
            const s = solveExposure({ sceneEv: LIGHT_CONDITION_EV[light], intent, motion, support, focalMm: 55, body: FULL_FRAME, lens: KIT_ZOOM });
            expect(s.aperture).not.toBeNull();
            expect(s.aperture!).toBeGreaterThanOrEqual(5.6);
          }
        }
      }
    }
  });

  it("unknown lens → aperture is null in the output, never a number", () => {
    for (const light of LIGHTS) {
      for (const intent of INTENTS) {
        for (const motion of MOTIONS) {
          for (const support of SUPPORTS) {
            const s = solveExposure({ sceneEv: LIGHT_CONDITION_EV[light], intent, motion, support, focalMm: 50, body: FULL_FRAME, lens: UNKNOWN_LENS });
            expect(s.aperture).toBeNull();
          }
        }
      }
    }
  });

  it("isoMode locked at 100 in night_no_street → shortfallStops > 0 and shutterS never below floor.floorS", () => {
    const locked: BodyProfile = { ...FULL_FRAME, isoMode: "locked", isoValue: 100 };

    for (const motion of MOTIONS) {
      for (const lens of [FIFTY_PRIME, UNKNOWN_LENS]) {
        const s = solveExposure({ sceneEv: LIGHT_CONDITION_EV.night_no_street, intent: "natural", motion, support: "handheld", focalMm: 50, body: locked, lens });
        expect(s.iso).toBe(100);
        expect(s.shortfallStops).toBeGreaterThan(0);
        // "Below the floor" = a slower (longer) shutter than floorS.
        expect(s.shutterS).toBeLessThanOrEqual(s.floor.floorS);
      }
    }
  });

  it('tripod + static → floor.setBy === "tripod"', () => {
    const floor = computeShutterFloor({ focalMm: 50, body: FULL_FRAME, lens: FIFTY_PRIME, motion: "static", support: "tripod" });
    expect(floor.setBy).toBe("tripod");

    const s = solveExposure({ sceneEv: LIGHT_CONDITION_EV.blue_hour, intent: "natural", focalMm: 50, body: FULL_FRAME, lens: FIFTY_PRIME, motion: "static", support: "tripod" });
    expect(s.floor.setBy).toBe("tripod");
  });

  it("every returned solution has a non-empty floor.explain", () => {
    const bodies: BodyProfile[] = [
      FULL_FRAME,
      { ...FULL_FRAME, cropFactor: null },
      { ...FULL_FRAME, cropFactor: 1.5, ibisStops: 5 },
      { ...FULL_FRAME, isoMode: "capped", isoMax: 3200 },
      { ...FULL_FRAME, isoMode: "locked", isoValue: 400 },
    ];
    const lenses: LensProfile[] = [
      FIFTY_PRIME,
      KIT_ZOOM,
      UNKNOWN_LENS,
      { ...KIT_ZOOM, stabilised: true, stabStops: 3 },
    ];

    let count = 0;
    for (const light of LIGHTS) {
      for (const intent of INTENTS) {
        for (const motion of MOTIONS) {
          for (const support of SUPPORTS) {
            for (const body of bodies) {
              for (const lens of lenses) {
                for (const focalMm of [18, 35, 55]) {
                  const s = solveExposure({ sceneEv: LIGHT_CONDITION_EV[light], intent, motion, support, body, lens, focalMm });
                  expect(s.floor.explain.trim().length).toBeGreaterThan(0);
                  count++;
                }
              }
            }
          }
        }
      }
    }
    expect(count).toBeGreaterThan(0);
  });
});

describe("stabilised handheld floor cap", () => {
  it("caps at 1/4 when stabilisation would allow slower, and says the limit was reached", () => {
    // 5 stops at 24mm would be 32/24 ≈ 1.3s uncapped.
    const floor = computeShutterFloor({ focalMm: 24, body: { ...FULL_FRAME, ibisStops: 5 }, lens: FIFTY_PRIME, motion: "static", support: "handheld" });
    expect(floor.floorS).toBe(1 / 4);
    expect(floor.setBy).toBe("stabilised");
    expect(floor.explain).toMatch(/stabilisation limit reached/);
  });

  it("leaves a stabilised floor under the cap untouched", () => {
    const floor = computeShutterFloor({ focalMm: 50, body: { ...FULL_FRAME, ibisStops: 3 }, lens: FIFTY_PRIME, motion: "static", support: "handheld" });
    expect(floor.floorS).toBeCloseTo(8 / 50, 12);
    expect(floor.setBy).toBe("stabilised");
    expect(floor.explain).not.toMatch(/limit/);
  });
});

describe("sceneEv is a number, used exactly as given", () => {
  const args = { intent: "natural" as const, focalMm: 50, body: FULL_FRAME, lens: FIFTY_PRIME, motion: "static" as const, support: "tripod" as const };

  it("a text condition is exactly its LIGHT_CONDITION_EV value: night_no_street behaves as EV 4", () => {
    expect(solveExposure({ ...args, sceneEv: LIGHT_CONDITION_EV.night_no_street })).toEqual(
      solveExposure({ ...args, sceneEv: 4 })
    );
  });

  it("a measured EV 1.5 is not snapped to night_no_street (EV 4)", () => {
    const measured = solveExposure({ ...args, sceneEv: 1.5 });
    const bucket = solveExposure({ ...args, sceneEv: LIGHT_CONDITION_EV.night_no_street });
    expect(measured).not.toEqual(bucket);
    expect(measured.shutterS).toBeCloseTo(bucket.shutterS * 2 ** 2.5, 9);
  });

  it("a fractional EV 9.3 is used as-is: 0.3 stop faster than EV 9, not rounded to a bucket", () => {
    const fractional = solveExposure({ ...args, sceneEv: 9.3 });
    const nine = solveExposure({ ...args, sceneEv: 9 });
    expect(fractional.shutterS).toBeCloseTo(nine.shutterS / 2 ** 0.3, 12);
    for (const ev of Object.values(LIGHT_CONDITION_EV)) {
      expect(fractional).not.toEqual(solveExposure({ ...args, sceneEv: ev }));
    }
  });

  it("a non-finite sceneEv throws", () => {
    expect(() => solveExposure({ ...args, sceneEv: Number.NaN })).toThrow(RangeError);
    expect(() => solveExposure({ ...args, sceneEv: Number.POSITIVE_INFINITY })).toThrow(RangeError);
  });
});
