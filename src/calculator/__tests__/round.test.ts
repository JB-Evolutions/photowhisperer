import { describe, it, expect } from "vitest";
import { roundToCameraSteps } from "../round";
import { solveExposure } from "../ladder";
import {
  CAMERA_APERTURE_STEPS,
  CAMERA_ISO_STEPS,
  CAMERA_SHUTTER_STEPS_S,
} from "../constants";
import {
  INTENT_STOPS,
  LIGHT_CONDITION_EV,
  type BodyProfile,
  type BrightnessIntent,
  type ExposureSolution,
  type LensProfile,
  type LightCondition,
  type SubjectMotion,
  type Support,
} from "../../lib/contract/types";

function solution(overrides: Partial<ExposureSolution>): ExposureSolution {
  return {
    aperture: 2,
    shutterS: 1 / 50,
    iso: 100,
    shortfallStops: 0,
    floor: { floorS: 1 / 50, setBy: "reciprocal", explain: "1/50 from the reciprocal rule at 50mm" },
    ladderTrace: [],
    ...overrides,
  };
}

describe("roundToCameraSteps — aperture rounds to a third stop, narrower", () => {
  it("rounds a mid-zoom value to the next narrower step", () => {
    expect(roundToCameraSteps(solution({ aperture: 4.47 })).aperture).toBe(4.5);
    expect(roundToCameraSteps(solution({ aperture: 4.51 })).aperture).toBe(5.0);
  });

  it("never picks the wider neighbour, even when it is nearer", () => {
    expect(roundToCameraSteps(solution({ aperture: 1.7 })).aperture).toBe(1.8);
  });

  it("leaves a value already on a step unchanged", () => {
    expect(roundToCameraSteps(solution({ aperture: 5.6 })).aperture).toBe(5.6);
    expect(roundToCameraSteps(solution({ aperture: 3.5 })).aperture).toBe(3.5);
  });

  it("keeps an unknown-lens aperture null", () => {
    expect(roundToCameraSteps(solution({ aperture: null })).aperture).toBeNull();
  });
});

describe("roundToCameraSteps — shutter rounds to a standard step, faster", () => {
  it("rounds an off-step value to the next faster step", () => {
    expect(roundToCameraSteps(solution({ shutterS: 1 / 2048 })).shutterS).toBe(1 / 2500);
    expect(roundToCameraSteps(solution({ shutterS: 1 / 75 })).shutterS).toBe(1 / 80);
  });

  it("leaves a floor already on a step unchanged", () => {
    expect(roundToCameraSteps(solution({ shutterS: 1 / 50 })).shutterS).toBe(1 / 50);
    expect(roundToCameraSteps(solution({ shutterS: 1 / 4 })).shutterS).toBe(1 / 4);
    expect(roundToCameraSteps(solution({ shutterS: 30 })).shutterS).toBe(30);
  });
});

describe("roundToCameraSteps — ISO rounds to a third stop, up", () => {
  it("rounds an off-step value up", () => {
    expect(roundToCameraSteps(solution({ iso: 158 })).iso).toBe(160);
    expect(roundToCameraSteps(solution({ iso: 506 })).iso).toBe(640);
  });

  it("leaves a value already on a step unchanged", () => {
    expect(roundToCameraSteps(solution({ iso: 100 })).iso).toBe(100);
    expect(roundToCameraSteps(solution({ iso: 25600 })).iso).toBe(25600);
  });
});

describe("roundToCameraSteps — shortfallStops recomputed after rounding", () => {
  it("reports light lost to narrower aperture and faster shutter", () => {
    const r = roundToCameraSteps(solution({ aperture: 4.47, shutterS: 1 / 2048, iso: 100 }));
    expect(r.shortfallStops).toBeCloseTo(Math.log2(2500 / 2048) + 2 * Math.log2(4.5 / 4.47), 9);
  });

  it("shrinks an existing gap by the light ISO rounding gains", () => {
    const r = roundToCameraSteps(solution({ iso: 3000, shortfallStops: 1 }));
    expect(r.shortfallStops).toBeCloseTo(1 + Math.log2(3000 / 3200), 9);
  });

  it("never goes negative when rounding gains more light than was missing", () => {
    expect(roundToCameraSteps(solution({ iso: 506, shortfallStops: 0 })).shortfallStops).toBe(0);
  });

  it("reports 0 when every value is already on a step", () => {
    expect(roundToCameraSteps(solution({})).shortfallStops).toBe(0);
  });
});

describe("roundToCameraSteps — safe direction holds for every solveExposure output", () => {
  const FULL_FRAME: BodyProfile = {
    label: "Full frame", cropFactor: 1, ibisStops: null, isoBase: 100,
    isoMode: "auto", isoValue: null, isoMax: null,
  };
  const bodies: BodyProfile[] = [
    FULL_FRAME,
    { ...FULL_FRAME, cropFactor: 1.5, ibisStops: 5 },
    { ...FULL_FRAME, isoMode: "locked", isoValue: 400 },
  ];
  const lenses: LensProfile[] = [
    { label: "50mm f/1.8", focalMinMm: 50, focalMaxMm: 50, aperWide: 1.8, aperTele: 1.8, stabilised: false, stabStops: null, confidence: "high" },
    { label: "18-55mm f/3.5-5.6", focalMinMm: 18, focalMaxMm: 55, aperWide: 3.5, aperTele: 5.6, stabilised: true, stabStops: 3, confidence: "high" },
    { label: "my lens", focalMinMm: null, focalMaxMm: null, aperWide: null, aperTele: null, stabilised: null, stabStops: null, confidence: "unknown" },
  ];
  const lights = Object.keys(LIGHT_CONDITION_EV) as LightCondition[];
  const intents = Object.keys(INTENT_STOPS) as BrightnessIntent[];
  const motions: SubjectMotion[] = ["static", "slow", "walking", "fast"];
  const supports: Support[] = ["handheld", "tripod"];

  it("aperture never wider, shutter never below the floor, ISO never lower, all on camera steps", () => {
    let count = 0;
    for (const light of lights) for (const intent of intents) for (const motion of motions)
      for (const support of supports) for (const body of bodies) for (const lens of lenses)
        for (const focalMm of [18, 35, 55]) {
          const exact = solveExposure({ sceneEv: LIGHT_CONDITION_EV[light], intent, motion, support, body, lens, focalMm });
          const r = roundToCameraSteps(exact);

          if (exact.aperture == null) {
            expect(r.aperture).toBeNull();
          } else {
            expect(r.aperture!).toBeGreaterThanOrEqual(exact.aperture);
            expect(CAMERA_APERTURE_STEPS).toContain(r.aperture);
          }
          expect(r.shutterS).toBeLessThanOrEqual(exact.floor.floorS * (1 + 1e-9));
          expect(r.shutterS).toBeLessThanOrEqual(exact.shutterS * (1 + 1e-9));
          expect(CAMERA_SHUTTER_STEPS_S).toContain(r.shutterS);
          expect(r.iso).toBeGreaterThanOrEqual(exact.iso);
          expect(CAMERA_ISO_STEPS).toContain(r.iso);
          expect(r.shortfallStops).toBeGreaterThanOrEqual(0);
          count++;
        }
    expect(count).toBeGreaterThan(0);
  });
});

describe("roundToCameraSteps — isoCeiling clamps rounded ISO", () => {
  const FULL_FRAME: BodyProfile = {
    label: "Full frame", cropFactor: 1, ibisStops: null, isoBase: 100,
    isoMode: "auto", isoValue: null, isoMax: null,
  };
  const FIFTY_PRIME: LensProfile = {
    label: "50mm f/1.8", focalMinMm: 50, focalMaxMm: 50, aperWide: 1.8, aperTele: 1.8,
    stabilised: false, stabStops: null, confidence: "high",
  };

  it("capped at 3000 → ISO stays 3000 instead of rounding to 3200, and shortfall grows", () => {
    const capped: BodyProfile = { ...FULL_FRAME, isoMode: "capped", isoMax: 3000 };
    // Fast motion puts the floor at 1/250, so this scene wants ~ISO 5066 and
    // the exact solve pins ISO to the 3000 cap.
    const exact = solveExposure({ sceneEv: LIGHT_CONDITION_EV.night_no_street, intent: "natural", motion: "fast", support: "handheld", focalMm: 50, body: capped, lens: FIFTY_PRIME });
    expect(exact.iso).toBe(3000);

    const unclamped = roundToCameraSteps(exact);
    const clamped = roundToCameraSteps(exact, capped.isoMax!);
    expect(unclamped.iso).toBe(3200);
    expect(clamped.iso).toBe(3000);
    // The clamp gives back the third stop that rounding up to 3200 gained.
    expect(clamped.shortfallStops).toBeCloseTo(unclamped.shortfallStops + Math.log2(3200 / 3000), 9);
    expect(clamped.shortfallStops).toBeGreaterThan(unclamped.shortfallStops);
  });

  it("locked ISO never moves, on-step or off-step", () => {
    for (const isoValue of [100, 400, 3000]) {
      const locked: BodyProfile = { ...FULL_FRAME, isoMode: "locked", isoValue };
      for (const light of Object.keys(LIGHT_CONDITION_EV) as LightCondition[]) {
        const exact = solveExposure({ sceneEv: LIGHT_CONDITION_EV[light], intent: "natural", motion: "static", support: "handheld", focalMm: 50, body: locked, lens: FIFTY_PRIME });
        expect(roundToCameraSteps(exact, locked.isoValue!).iso).toBe(isoValue);
      }
    }
  });
});
