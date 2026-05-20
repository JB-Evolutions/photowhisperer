import type { SceneInput, SettingsOutput } from "./types.js";
import {
  STANDARD_APERTURES,
  STANDARD_SHUTTERS,
  STANDARD_ISOS,
  MOTION_FLOORS,
  DEFAULT_APERTURE,
  WB_COLOR_TEMP,
  ISO_MIN,
  ISO_MAX,
  TRIPOD_LONG_EXPOSURE_LIMIT_S,
  FLASH_SYNC_SHUTTER_S,
  FLASH_DEFAULT_ISO,
} from "./constants.js";
import { formatAperture, formatShutter } from "./format.js";

function slowestStandardShutterMeetingFloor(floor: number): number {
  const valid = STANDARD_SHUTTERS.filter((s) => s <= floor);
  return valid.length > 0 ? Math.max(...valid) : STANDARD_SHUTTERS[0];
}

function solveIso(scene_ev: number, aperture: number, shutter_seconds: number): number {
  const ev100 = Math.log2((aperture * aperture) / shutter_seconds);
  return 100 * Math.pow(2, ev100 - scene_ev);
}

function roundIsoToStandard(iso: number): number {
  if (iso <= STANDARD_ISOS[0]) return STANDARD_ISOS[0];
  if (iso >= STANDARD_ISOS[STANDARD_ISOS.length - 1]) return STANDARD_ISOS[STANDARD_ISOS.length - 1];
  for (let i = 0; i < STANDARD_ISOS.length - 1; i++) {
    const a = STANDARD_ISOS[i];
    const b = STANDARD_ISOS[i + 1];
    if (a <= iso && iso <= b) {
      return iso - a > b - iso ? b : a;
    }
  }
  return STANDARD_ISOS[STANDARD_ISOS.length - 1];
}

export function calculateSettings(input: SceneInput): SettingsOutput {
  // Step 1 — assumptions / warnings
  const assumptions: string[] = [];
  const warnings: string[] = [];

  if (input.focal_length_assumed) {
    assumptions.push(
      `Assumed ${input.focal_length_mm}mm full-frame focal length (handheld, not specified).`
    );
  }

  // Step 2 — flash override
  if (input.white_balance === "flash") {
    const shutter = FLASH_SYNC_SHUTTER_S;
    const aperture = DEFAULT_APERTURE[input.creative_intent];
    const iso = FLASH_DEFAULT_ISO;

    if (input.support === "handheld" && 1 / input.focal_length_mm < FLASH_SYNC_SHUTTER_S) {
      warnings.push(
        "Lens long enough that handheld at flash sync speed may show shake; consider tripod or high-speed sync."
      );
    }

    return {
      status: "ok",
      iso,
      aperture: formatAperture(aperture),
      shutter_speed: formatShutter(shutter),
      white_balance: input.white_balance,
      color_temperature: "5500K",
      assumptions,
      warnings,
      scene_summary: input.scene_summary,
    };
  }

  // Step 3 — shutter floor
  const motionFloor = MOTION_FLOORS[input.motion_tier];
  let floor: number;

  if (input.support === "handheld") {
    const shakeFloor = 1 / input.focal_length_mm;
    floor = Math.min(motionFloor, shakeFloor);
  } else if (
    (input.support === "tripod" || input.support === "stabilized") &&
    input.motion_tier === "stationary"
  ) {
    floor = TRIPOD_LONG_EXPOSURE_LIMIT_S;
  } else {
    floor = motionFloor;
  }

  // Step 4 — initial shutter
  let shutter = slowestStandardShutterMeetingFloor(floor);

  // Step 5 — initial aperture
  let aperture = DEFAULT_APERTURE[input.creative_intent];

  // Step 6 — solve for ISO
  let isoIdeal = solveIso(input.scene_ev, aperture, shutter);

  // Step 7 — too bright
  if (isoIdeal < ISO_MIN) {
    const stops = Math.log2(ISO_MIN / isoIdeal);
    const idx = STANDARD_SHUTTERS.indexOf(shutter);
    const newIdx = Math.max(0, idx - Math.round(stops));
    shutter = STANDARD_SHUTTERS[newIdx];
    isoIdeal = solveIso(input.scene_ev, aperture, shutter);

    if (isoIdeal < ISO_MIN) {
      const stops2 = Math.log2(ISO_MIN / isoIdeal);
      const apIdx = STANDARD_APERTURES.indexOf(aperture);
      const newApIdx = Math.min(STANDARD_APERTURES.length - 1, apIdx + Math.round(stops2));
      aperture = STANDARD_APERTURES[newApIdx];
      isoIdeal = solveIso(input.scene_ev, aperture, shutter);
    }
  }

  // Step 8 — too dark
  if (isoIdeal > ISO_MAX) {
    const stops = Math.log2(isoIdeal / ISO_MAX);
    const apIdx = STANDARD_APERTURES.indexOf(aperture);
    const newApIdx = Math.max(0, apIdx - Math.round(stops));
    if (newApIdx !== apIdx) {
      aperture = STANDARD_APERTURES[newApIdx];
      isoIdeal = solveIso(input.scene_ev, aperture, shutter);
    }

    if (
      isoIdeal > ISO_MAX &&
      (input.support === "tripod" || input.support === "stabilized") &&
      input.motion_tier === "stationary"
    ) {
      const stopsLeft = Math.log2(isoIdeal / ISO_MAX);
      const curIdx = STANDARD_SHUTTERS.indexOf(shutter);
      const newIdx = Math.min(STANDARD_SHUTTERS.length - 1, curIdx + Math.round(stopsLeft));
      shutter = STANDARD_SHUTTERS[newIdx];
      isoIdeal = solveIso(input.scene_ev, aperture, shutter);
    }

    if (isoIdeal > ISO_MAX) {
      isoIdeal = ISO_MAX;
      warnings.push(
        "Scene darker than calculator can fully expose. Image may be underexposed; consider tripod, longer exposure, or flash."
      );
    }
  }

  // Step 9 — round ISO
  const iso = roundIsoToStandard(Math.max(ISO_MIN, Math.min(ISO_MAX, isoIdeal)));

  // Step 10 — final sanity warnings
  if (input.support === "handheld" && shutter >= 1) {
    warnings.push("Shutter is 1 second or longer; tripod required for sharp results.");
  }

  // Step 11 — build output
  const colorTemp = WB_COLOR_TEMP[input.white_balance];
  return {
    status: "ok",
    iso,
    aperture: formatAperture(aperture),
    shutter_speed: formatShutter(shutter),
    white_balance: input.white_balance,
    color_temperature: colorTemp !== null ? `${colorTemp}K` : null,
    assumptions,
    warnings,
    scene_summary: input.scene_summary,
  };
}
