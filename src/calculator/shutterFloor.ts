import type {
  BodyProfile,
  LensProfile,
  ShutterFloor,
  SubjectMotion,
  Support,
} from "../lib/contract/types";
import {
  STABILISED_HANDHELD_MAX_S,
  SUBJECT_MOTION_MIN_S,
  TRIPOD_LONG_EXPOSURE_LIMIT_S,
} from "./constants";
import { formatShutter } from "./format";

const MOTION_REASON: Record<Exclude<SubjectMotion, "static">, string> = {
  slow: "keep slow movement sharp",
  walking: "freeze walking people",
  fast: "freeze fast action",
};

// formatShutter prints raw seconds at 1s and above, which a stabilised floor
// can produce as an unreadable float (e.g. 1.3333333333333333").
export function describeShutter(seconds: number): string {
  return seconds >= 1 ? `${Number(seconds.toFixed(1))}s` : formatShutter(seconds);
}

// The slowest shutter that avoids blur, and which constraint set it. Floors
// are durations in seconds: a SMALLER floorS is a faster, stricter floor.
//
// cropFactor null is treated as 1.0; the caller owns the assumption line.
export function computeShutterFloor(args: {
  focalMm: number;
  body: BodyProfile;
  lens: LensProfile;
  motion: SubjectMotion;
  support: Support;
}): ShutterFloor {
  const { focalMm, body, lens, motion, support } = args;

  let floor: ShutterFloor;
  if (support === "tripod") {
    // The handheld term is removed entirely, not just relaxed.
    floor = {
      floorS: TRIPOD_LONG_EXPOSURE_LIMIT_S,
      setBy: "tripod",
      explain: `No handheld shake limit on a tripod, so exposures up to ${describeShutter(TRIPOD_LONG_EXPOSURE_LIMIT_S)} are fine`,
    };
  } else {
    const cropFactor = body.cropFactor ?? 1;
    const reciprocalS = 1 / (focalMm * cropFactor);
    // stabilised is only trusted when explicitly true (null = unknown), and
    // lens OIS and IBIS don't stack: the better system sets the gain.
    const stabStops = Math.max(
      lens.stabilised === true ? (lens.stabStops ?? 0) : 0,
      body.ibisStops ?? 0
    );

    if (stabStops > 0) {
      const stabilisedS = reciprocalS * 2 ** stabStops;
      floor =
        stabilisedS > STABILISED_HANDHELD_MAX_S
          ? {
              floorS: STABILISED_HANDHELD_MAX_S,
              setBy: "stabilised",
              explain: `${describeShutter(STABILISED_HANDHELD_MAX_S)} handheld at ${focalMm}mm; stabilisation limit reached, slower won't hold steady`,
            }
          : {
              floorS: stabilisedS,
              setBy: "stabilised",
              explain: `${describeShutter(stabilisedS)} handheld at ${focalMm}mm with ${stabStops} stop${stabStops === 1 ? "" : "s"} of stabilisation`,
            };
    } else {
      floor = {
        floorS: reciprocalS,
        setBy: "reciprocal",
        explain: `${describeShutter(reciprocalS)} from the reciprocal rule at ${focalMm}mm${cropFactor !== 1 ? ` on a ${cropFactor}× crop body` : ""}`,
      };
    }
  }

  // Subject motion only overrides when it is strictly faster; stabilisation
  // and tripods steady the camera, never the subject.
  if (motion !== "static" && SUBJECT_MOTION_MIN_S[motion] < floor.floorS) {
    const floorS = SUBJECT_MOTION_MIN_S[motion];
    floor = {
      floorS,
      setBy: "subject_motion",
      explain: `${describeShutter(floorS)} to ${MOTION_REASON[motion]}`,
    };
  }

  return floor;
}
