import {
  effectiveIsoCeiling,
  INTENT_STOPS,
  type BodyProfile,
  type BrightnessIntent,
  type ExposureSolution,
  type LensProfile,
  type SubjectMotion,
  type Support,
} from "../lib/contract/types";
import { apertureAtFocal } from "../lib/lens/parse";
import { STANDARD_SHUTTERS, UNKNOWN_LENS_NOTIONAL_APERTURE } from "./constants";
import { formatAperture } from "./format";
import { computeShutterFloor, describeShutter } from "./shutterFloor";

// Absorbs float noise so a shutter that lands exactly on the floor isn't
// read as a hair past it (which would raise ISO by a fraction of a unit).
const EPSILON = 1e-9;

// apertureAtFocal returns an unrounded f-number mid-zoom (e.g. 4.47). Trace
// text shows it to one decimal, rounded narrower so it never reads wider than
// the lens reaches.
function narrowerTenth(fNumber: number): number {
  // toFixed strips float noise (5.6 * 10 = 56.00000000000001) before ceil.
  return Math.ceil(Number((fNumber * 10).toFixed(6))) / 10;
}

// Strictly ordered exposure ladder:
//   rung 1 — open the aperture to the lens limit at focalMm
//   rung 2 — lower the shutter toward floor.floorS
//   rung 3 — raise ISO from body.isoBase (absent when isoMode is "locked")
// No rung is touched until the one before it is exhausted, and the floor is
// never breached: whatever light is still missing after the last rung is
// reported as shortfallStops for the caller to surface.
//
// shutterS and iso are exact solved values, not snapped to a camera's
// third-stop scale; roundToCameraSteps in round.ts snaps them for display.
//
// sceneEv is the scene's EV at ISO 100, resolved by the caller: a text
// request passes LIGHT_CONDITION_EV[condition], a photo passes
// resolveSceneEv()'s scene_ev as-is. It is never bucketed here.
export function solveExposure(args: {
  sceneEv: number;
  intent: BrightnessIntent;
  focalMm: number;
  body: BodyProfile;
  lens: LensProfile;
  motion: SubjectMotion;
  support: Support;
}): ExposureSolution {
  const { sceneEv, intent, focalMm, body, lens } = args;
  if (!Number.isFinite(sceneEv)) {
    throw new RangeError(`solveExposure: sceneEv must be a finite number, got ${sceneEv}`);
  }
  const floor = computeShutterFloor(args);
  const ladderTrace: string[] = [];

  // Intent moves the TARGET before the solve and is never revisited during
  // it. moody (-1) asks for one stop less exposure, i.e. a target EV one
  // higher; any shortfall below is measured against that deliberate target,
  // so moody can never absorb a real shortfall.
  const targetEv = sceneEv - INTENT_STOPS[intent];

  // Rung 1.
  const lensLimit = apertureAtFocal(lens, focalMm);
  const solveAperture = lensLimit ?? UNKNOWN_LENS_NOTIONAL_APERTURE;
  ladderTrace.push(
    lensLimit == null
      ? `Aperture: widest your lens allows (lens unknown, ${formatAperture(UNKNOWN_LENS_NOTIONAL_APERTURE)} assumed for the maths)`
      : `Aperture: opened to ${formatAperture(narrowerTenth(lensLimit))}, the widest your lens allows at ${focalMm}mm`
  );

  // Locked ISO holds for the whole solve, so it's also the ISO rungs 1-2
  // are solved at.
  const locked = body.isoMode === "locked";
  const startIso = locked ? (body.isoValue ?? body.isoBase) : body.isoBase;

  // Shutter giving correct exposure at the rung-1 aperture and startIso:
  // EV100 = log2(N² / t), and each doubling of ISO halves the shutter needed.
  const neededS = ((solveAperture * solveAperture) / 2 ** targetEv) * (100 / startIso);

  // Rung 2, enough light: the shutter never has to reach the floor.
  if (neededS <= floor.floorS * (1 + EPSILON)) {
    const fastestS = STANDARD_SHUTTERS[0];
    if (neededS >= fastestS * (1 - EPSILON)) {
      ladderTrace.push(
        `Shutter: ${describeShutter(neededS)}, within the ${describeShutter(floor.floorS)} floor; ISO stays at ${startIso}`
      );
      return { aperture: lensLimit, shutterS: neededS, iso: startIso, shortfallStops: 0, floor, ladderTrace };
    }

    // Too bright for the fastest shutter even at startIso. Aperture is the
    // only light-reducing lever left, and stopping down is always within
    // what the lens can do. An unknown lens has no numeric aperture to
    // report, so the overshoot is described instead.
    const excessStops = Math.log2(fastestS / neededS);
    ladderTrace.push(`Shutter: ${describeShutter(fastestS)}, the fastest available`);
    if (lensLimit == null) {
      ladderTrace.push(
        `Aperture: stop down about ${excessStops.toFixed(1)} stops from ${formatAperture(UNKNOWN_LENS_NOTIONAL_APERTURE)}; too bright for ${describeShutter(fastestS)}`
      );
      return { aperture: null, shutterS: fastestS, iso: startIso, shortfallStops: 0, floor, ladderTrace };
    }
    const stoppedDown = narrowerTenth(solveAperture * 2 ** (excessStops / 2));
    ladderTrace.push(
      `Aperture: stopped down to ${formatAperture(stoppedDown)}; too bright for ${describeShutter(fastestS)} at ${formatAperture(narrowerTenth(lensLimit))}`
    );
    return { aperture: stoppedDown, shutterS: fastestS, iso: startIso, shortfallStops: 0, floor, ladderTrace };
  }

  // Rung 2, exhausted: shutter sits on the floor and stays there.
  const shutterS = floor.floorS;
  const stopsShort = Math.log2(neededS / shutterS);
  ladderTrace.push(`Shutter: slowed to the ${describeShutter(shutterS)} floor`);

  // Locked ISO has no rung 3; the whole remaining gap is shortfall.
  if (locked) {
    return { aperture: lensLimit, shutterS, iso: startIso, shortfallStops: stopsShort, floor, ladderTrace };
  }

  // Rung 3. The ceiling is the contract's, the same one roundToCameraSteps
  // clamps to, so the trace names the limit the user will actually hit and the
  // shortfall is counted once here rather than reappearing after rounding.
  // Math.max keeps a body whose base ISO already sits above its ceiling from
  // being handed a ceiling below the ISO it starts at.
  const ceiling = Math.max(startIso, effectiveIsoCeiling(body));
  const neededIso = startIso * 2 ** stopsShort;

  if (neededIso <= ceiling) {
    const iso = Math.ceil(neededIso - EPSILON);
    ladderTrace.push(`ISO: raised to ${iso}`);
    return { aperture: lensLimit, shutterS, iso, shortfallStops: 0, floor, ladderTrace };
  }

  const shortfallStops = Math.log2(neededIso / ceiling);
  ladderTrace.push(`ISO: raised to its ${ceiling} ceiling, still ${shortfallStops.toFixed(1)} stops short`);
  return { aperture: lensLimit, shutterS, iso: ceiling, shortfallStops, floor, ladderTrace };
}
