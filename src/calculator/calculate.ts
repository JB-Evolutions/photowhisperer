import type { SceneInput, SettingsOutput } from "./types";
import {
  STANDARD_APERTURES,
  STANDARD_SHUTTERS,
  STANDARD_ISOS,
  MOTION_FLOORS,
  DEFAULT_APERTURE,
  WB_COLOR_TEMP,
  ISO_MIN,
  ISO_MAX,
  ISO_SOFT_CAP,
  ISO_ORDINARY_CAP,
  EXTREME_LOW_LIGHT_EV_THRESHOLD,
  STANDARD_INTENT_WIDE_LIMIT,
  EXPOSURE_BIAS_STOPS,
  HANDHELD_ABSOLUTE_SHUTTER_FLOOR_S,
  TRIPOD_LONG_EXPOSURE_LIMIT_S,
  FLASH_SYNC_SHUTTER_S,
  FLASH_DEFAULT_ISO,
} from "./constants";
import { formatAperture, formatShutter } from "./format";

// Human-readable assumption text for each field the classifier reports as
// "defaulted" (i.e. the user didn't specify it). focal_length_mm is handled
// separately via focal_length_assumed — see below — so it's not in this map.
const DEFAULTED_ASSUMPTIONS: Record<string, string> = {
  motion_tier: "Assumed subject is stationary (movement not specified).",
  support: "Assumed handheld (support not specified).",
  creative_intent: "Assumed standard depth of field (creative intent not specified).",
  white_balance: "Assumed auto white balance (lighting color not specified).",
};

function slowestStandardShutterMeetingFloor(floor: number): number {
  const valid = STANDARD_SHUTTERS.filter((s) => s <= floor);
  return valid.length > 0 ? Math.max(...valid) : STANDARD_SHUTTERS[0];
}

function solveIso(scene_ev: number, aperture: number, shutter_seconds: number): number {
  const ev100 = Math.log2((aperture * aperture) / shutter_seconds);
  return 100 * Math.pow(2, ev100 - scene_ev);
}

// ISO is a log-scaled quantity — each standard stop doubles the previous one
// — so "nearest" must mean nearest in log2 space (the geometric midpoint,
// sqrt(a*b)), not nearest in raw linear units. Linear-midpoint rounding put
// the 3200/6400 boundary at 4800 instead of the correct ~4525, silently
// underexposing anything in (3200, 4800] by up to ~0.58 stop — a direct
// contributor to the "consistently ~1 stop dark" symptom this task exists to
// fix.
//
// Two other places round a log2 quantity and are NOT affected:
//   - nearestStandardApertureAtOrNarrowerThan / slowestStandardShutterMeetingFloor
//     are deliberately ceiling/floor selectors, not nearest-rounders, so the
//     linear-vs-log distinction doesn't apply to them.
//   - Steps 7/8's Math.round(stopsNeeded), which picks an aperture/shutter
//     GRID INDEX to jump to, looks like it could have the same bias, but
//     doesn't: every isoIdeal reassignment in this file is a fresh
//     solveIso(scene_ev, aperture, shutter) call from the FINAL quantized
//     aperture/shutter (never an arithmetic carry-forward like
//     isoIdeal / 2**stops), so whatever gap that rounding leaves between the
//     chosen grid index and the true continuous target is fully captured by
//     the recompute — nothing leaks through uncorrected. This function is
//     the one place a genuine "nearest" comparison happens, which is why the
//     geometric-vs-linear distinction matters only here.
export function roundIsoToStandard(iso: number): number {
  if (iso <= STANDARD_ISOS[0]) return STANDARD_ISOS[0];
  if (iso >= STANDARD_ISOS[STANDARD_ISOS.length - 1]) return STANDARD_ISOS[STANDARD_ISOS.length - 1];
  for (let i = 0; i < STANDARD_ISOS.length - 1; i++) {
    const a = STANDARD_ISOS[i];
    const b = STANDARD_ISOS[i + 1];
    if (a <= iso && iso <= b) {
      const geometricMidpoint = Math.sqrt(a * b);
      return iso < geometricMidpoint ? a : b;
    }
  }
  return STANDARD_ISOS[STANDARD_ISOS.length - 1];
}

// Widest standard aperture that is still narrower than (or equal to) what the
// lens can do. A raw lens spec like f/3.5 sits between grid points 2.8 and
// 4.0 — we must round toward 4.0 (narrower), never recommend 2.8, since the
// lens can't reach it.
//
// Must always round toward NARROWER, never "nearest" — orchestrate.ts feeds
// this interpolated apertures for variable-aperture zooms (e.g. a value
// between 2.8 and 4.0 for a lens partway through its zoom range), and that
// interpolation is itself an approximation that can overstate how wide the
// lens really is at a given focal length. Rounding to nearest would silently
// reintroduce the exact failure this function exists to prevent —
// recommending an aperture the lens cannot physically set. Round narrow,
// always.
function nearestStandardApertureAtOrNarrowerThan(value: number): number {
  const candidates = STANDARD_APERTURES.filter((a) => a >= value - 1e-9);
  return candidates.length > 0
    ? Math.min(...candidates)
    : STANDARD_APERTURES[STANDARD_APERTURES.length - 1];
}

// The widest aperture the concession ladder is allowed to widen toward, and
// whether the user's own gear (rather than creative-intent policy) is what
// binds that limit.
//
// orchestrate.ts's deriveMaxAperture only ever returns a non-null
// max_aperture sourced from a lens CONFIRMED to cover focal_length_mm when
// focal_length_assumed is false — so in that case gear is reliably scoped
// and trusted fully, even wider than policy. The one case gear is NOT
// reliably scoped is focal_length_assumed: true, where max_aperture is the
// kit-wide widest against a guessed 50mm, not confirmed to cover wherever
// the user actually is — there, gear may only narrow the policy default,
// never widen past it (narrowing is always safe regardless of scoping).
function widestAllowedAperture(
  intent: SceneInput["creative_intent"],
  maxAperture: number | null | undefined,
  focalLengthAssumed: boolean
): { widest: number; lensLimited: boolean } {
  if (intent === "deep_dof") {
    // Protected: a deep-DOF request never widens to save ISO, regardless of gear.
    return { widest: DEFAULT_APERTURE.deep_dof, lensLimited: false };
  }

  const policyWidest =
    intent === "shallow_dof" ? STANDARD_APERTURES[0] : STANDARD_INTENT_WIDE_LIMIT;

  if (maxAperture == null) {
    return { widest: policyWidest, lensLimited: false };
  }

  const lensWidestOnGrid = nearestStandardApertureAtOrNarrowerThan(maxAperture);

  if (!focalLengthAssumed) {
    return { widest: lensWidestOnGrid, lensLimited: lensWidestOnGrid > policyWidest };
  }

  return lensWidestOnGrid > policyWidest
    ? { widest: lensWidestOnGrid, lensLimited: true }
    : { widest: policyWidest, lensLimited: false };
}

export function apertureWidenedWarning(aperture: number): string {
  return `Aperture opened to ${formatAperture(aperture)} to keep ISO down; background will be noticeably blurred. Add light, or accept a higher ISO, if you need more of the scene sharp.`;
}

// Remedies for the Step 10 ISO warnings, gated on what's actually available to
// the user rather than hardcoded per cause branch.
//
// - "Use a tripod for a longer exposure" is excluded for tripod/stabilized: on
//   that support, the shutter is either already at the dead-code 30s ceiling
//   (stationary — see Step 8's tripod-extension block) or bound by the motion
//   floor (non-stationary, where going slower would contradict the very floor
//   that's keeping the subject sharp). It's ALSO excluded for handheld when
//   floorCause is "motion", not "shake": a tripod only buys anything when the
//   camera's own shake is the binding constraint — if the subject's movement
//   is what's capping the shutter (Step 3 uses MOTION_FLOORS there too),
//   mounting a tripod does nothing for it.
// - "Accept a shallower depth of field" only applies to deep_dof: that's the
//   one intent where the user's own request, not gear or light, is pinning
//   the aperture and driving ISO up — mirrors apertureWidenedWarning's
//   converse trade ("accept a higher ISO").
function buildRemedies(
  input: SceneInput,
  lensLimitedAperture: boolean,
  underexposed: boolean
): string[] {
  const remedies = ["add light"];
  if (input.creative_intent === "deep_dof") remedies.push("accept a shallower depth of field");
  if (lensLimitedAperture) remedies.push("use a faster lens");
  // `!== "motion"` also admits null, which is safe here only because
  // floorCause never returns null on the handheld path (see its own
  // branching) — that's guarded by the `support === "handheld"` conjunct
  // above, not guaranteed by floorCause's own return type.
  if (input.support === "handheld" && floorCause(input) !== "motion") {
    remedies.push("use a tripod for a longer exposure");
  }
  if (underexposed) remedies.push("use flash");
  return remedies;
}

function joinRemedies(remedies: string[]): string {
  if (remedies.length === 1) return remedies[0];
  if (remedies.length === 2) return `${remedies[0]} or ${remedies[1]}`;
  return `${remedies.slice(0, -1).join(", ")}, or ${remedies[remedies.length - 1]}`;
}

// Handheld only: the shutter floor is bound by shake (1/focal_length), not by
// subject motion. Bracing/tripod advice is relevant because the user is, by
// definition, handheld here.
export const SHAKE_AT_FLOOR_WARNING =
  "Shutter is at the handheld shake floor with no margin left; brace against something or use a tripod.";

// Any support: the shutter floor is bound by the subject's motion tier
// (MOTION_FLOORS), not by camera shake — this can happen on a tripod too if
// the subject itself is moving. Deliberately says nothing about bracing or
// tripods: a tripod doesn't help when the subject, not the camera, is what's
// moving, and recommending one to a user already on a tripod is useless.
export const MOTION_AT_FLOOR_WARNING =
  "Shutter is at the motion floor for this subject with no margin left; faster-than-expected movement may blur.";

// Handheld shake floor, capped so it never allows a SLOWER shutter than
// HANDHELD_ABSOLUTE_SHUTTER_FLOOR_S (1/15) — see that constant for why the
// bare 1/focal_length_mm rule breaks down at ultra-wide focal lengths. Floors
// are durations in seconds, so preventing a slower (longer) duration than the
// cap means taking the min of the two: at 8mm, min(1/8=0.125, 1/15=0.067) =
// 0.067 → 1/15, the cap binds. At 24mm, min(1/24=0.042, 1/15=0.067) = 0.042 →
// 1/24 (rounds to the nearest standard shutter, 1/30 — a 1-stop recovery over
// the old forced 1/60), the cap does not bind. Computed once here and used at
// both call sites (Step 3's floor selection and floorCause's classification
// below) so the floor actually used and the warning naming why it bound can
// never disagree.
function handheldShakeFloor(focal_length_mm: number): number {
  return Math.min(1 / focal_length_mm, HANDHELD_ABSOLUTE_SHUTTER_FLOOR_S);
}

// True when the ultra-wide cap actually changed the shake floor from what the
// bare 1/focal_length_mm rule would have given. Used to decide whether the
// shake-at-floor warning is worth showing at all — see the noise-gate
// comment at its call site in Step 13.
function shakeFloorWasClamped(focal_length_mm: number): boolean {
  return 1 / focal_length_mm > HANDHELD_ABSOLUTE_SHUTTER_FLOOR_S;
}

// Classifies WHY the Step 3/4 floor binds, mirroring that step's own branches,
// so Step 13's warning can be worded correctly instead of assuming "handheld"
// always means "shake." Returns null for the tripod/stabilized + stationary
// case (TRIPOD_LONG_EXPOSURE_LIMIT_S) — that's a deliberate long-exposure
// allowance, not a margin risk, so no warning applies there.
function floorCause(input: SceneInput): "shake" | "motion" | null {
  if (input.support === "handheld") {
    if (input.motion_tier === "stationary") return "shake";
    const motionFloor = MOTION_FLOORS[input.motion_tier];
    const shakeFloor = handheldShakeFloor(input.focal_length_mm);
    return motionFloor <= shakeFloor ? "motion" : "shake";
  }
  if (input.motion_tier === "stationary") return null;
  return "motion";
}

export function calculateSettings(input: SceneInput): SettingsOutput {
  // Step 1 — assumptions / warnings
  const assumptions: string[] = [];
  const warnings: string[] = [];

  if (input.focal_length_assumed) {
    assumptions.push(
      input.support === "handheld"
        ? `Assumed ${input.focal_length_mm}mm full-frame focal length (not specified); handheld shake floor derives from it.`
        : `Assumed ${input.focal_length_mm}mm full-frame focal length (not specified).`
    );
  }

  for (const field of input.defaulted ?? []) {
    const text = DEFAULTED_ASSUMPTIONS[field];
    if (text) assumptions.push(text);
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
    const shakeFloor = handheldShakeFloor(input.focal_length_mm);
    // For a stationary subject there is nothing to freeze, so the motion
    // floor must not bind — only the focal-length shake rule governs
    // handheld alone (this is exactly where the ultra-wide cap in
    // handheldShakeFloor engages, e.g. 8mm). Non-stationary tiers still take
    // the min of both.
    floor = input.motion_tier === "stationary" ? shakeFloor : Math.min(motionFloor, shakeFloor);
  } else if (
    (input.support === "tripod" || input.support === "stabilized") &&
    input.motion_tier === "stationary"
  ) {
    floor = TRIPOD_LONG_EXPOSURE_LIMIT_S;
  } else {
    floor = motionFloor;
  }

  // Step 4 — initial shutter. Floors are durations in seconds, so the
  // shorter duration (the faster shutter) is the more restrictive one and
  // must win — do NOT change this to Math.max, that would let the slower of
  // the two constraints override the one that actually prevents blur.
  let shutter = slowestStandardShutterMeetingFloor(floor);

  // Step 5 — initial aperture
  let aperture = DEFAULT_APERTURE[input.creative_intent];

  // Step 6 — solve for ISO
  let isoIdeal = solveIso(input.scene_ev, aperture, shutter);

  // Step 7 — too bright: speed up shutter first, then narrow aperture
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

  // Step 8 — too dark: concede in priority order — aperture, then (tripod
  // only) shutter, then ISO. Triggers at the soft cap, not just when ISO
  // would blow past the hard ceiling, so the ladder actually prevents
  // needlessly high ISO rather than only reacting once it's extreme.
  let lensLimitedAperture = false;

  if (isoIdeal > ISO_SOFT_CAP) {
    const { widest: widestAllowed, lensLimited } = widestAllowedAperture(
      input.creative_intent,
      input.max_aperture,
      input.focal_length_assumed
    );
    const apIdx = STANDARD_APERTURES.indexOf(aperture);
    const widestIdx = STANDARD_APERTURES.indexOf(widestAllowed);

    if (widestIdx < apIdx) {
      const stopsNeeded = Math.log2(isoIdeal / ISO_SOFT_CAP);
      const unclampedIdx = apIdx - Math.round(stopsNeeded);
      const newIdx = Math.max(widestIdx, unclampedIdx);

      if (lensLimited && unclampedIdx < widestIdx) {
        lensLimitedAperture = true;
      }

      aperture = STANDARD_APERTURES[newIdx];
      isoIdeal = solveIso(input.scene_ev, aperture, shutter);
    }

    if (
      isoIdeal > ISO_SOFT_CAP &&
      (input.support === "tripod" || input.support === "stabilized") &&
      input.motion_tier === "stationary"
    ) {
      const stopsLeft = Math.log2(isoIdeal / ISO_SOFT_CAP);
      const curIdx = STANDARD_SHUTTERS.indexOf(shutter);
      const newIdx = Math.min(STANDARD_SHUTTERS.length - 1, curIdx + Math.round(stopsLeft));
      shutter = STANDARD_SHUTTERS[newIdx];
      isoIdeal = solveIso(input.scene_ev, aperture, shutter);
    }
  }

  // Step 9 — exposure residual + ISO cap policy. isoIdeal already reflects
  // the final quantized aperture/shutter exactly (solveIso was recomputed
  // fresh after each ladder step above), so folding EXPOSURE_BIAS_STOPS in
  // here — before the single remaining round-to-grid — is what keeps the
  // three independently-quantized values from drifting the same direction.
  const isExtremeLowLight = input.scene_ev <= EXTREME_LOW_LIGHT_EV_THRESHOLD;
  const isoCeiling = isExtremeLowLight ? ISO_MAX : ISO_ORDINARY_CAP;

  // isoCeiling (6400 or 12800) is always above ISO_SOFT_CAP (3200), so
  // underexposed implies iso lands exactly at isoCeiling, which is always
  // > ISO_SOFT_CAP — i.e. underexposed is only ever reached from inside the
  // `iso > ISO_SOFT_CAP` branch below, never separately.
  const underexposed = isoIdeal > isoCeiling;

  const biasedIsoIdeal = isoIdeal * Math.pow(2, EXPOSURE_BIAS_STOPS);
  const clampedIsoIdeal = Math.max(ISO_MIN, Math.min(isoCeiling, biasedIsoIdeal));
  const iso = roundIsoToStandard(clampedIsoIdeal);

  // Step 10 — ISO soft-cap warning + lens-limit note. Two independent facts
  // — ISO exceeded the soft cap; the lens capped how far the aperture could
  // widen — that can each be true or false regardless of the other.
  // Deliberately NOT if/else-if: the ISO warning must test the DISPLAYED iso
  // (never name a value at or below the cap as if it were high), while the
  // lens-limit note is true or false independent of where ISO landed. They're
  // combined (not duplicated) only in the one case where they'd say the same
  // thing — tracked via isoWarningNamesLens below, rather than relying on an
  // implicit "iso>cap && lensLimited always means cause=lens" coupling.
  let isoWarningNamesLens = false;

  if (iso > ISO_SOFT_CAP) {
    const apertureProtectedByDeepDof = input.creative_intent === "deep_dof";

    let cause: string;
    if (apertureProtectedByDeepDof) {
      cause = `the deep depth of field request holds the aperture at ${formatAperture(aperture)}`;
    } else if (lensLimitedAperture) {
      cause = `your lens can't open past ${formatAperture(aperture)}`;
      isoWarningNamesLens = true;
    } else if (input.support === "handheld") {
      cause = `the handheld shutter floor limits how slow the shutter can go`;
    } else {
      cause = `the scene is low light even after opening the aperture`;
    }

    const remedySentence = joinRemedies(buildRemedies(input, lensLimitedAperture, underexposed));

    if (underexposed) {
      warnings.push(
        `Scene darker than calculator can fully expose — ISO ${iso} needed because ${cause}. Image may be underexposed; ${remedySentence}.`
      );
    } else {
      warnings.push(`ISO ${iso} needed because ${cause}; ${remedySentence}.`);
    }
  }

  if (lensLimitedAperture && !isoWarningNamesLens) {
    // Independent of the ISO warning above — fires whenever the clamp
    // bound, even if ISO stayed at/under the soft cap (nothing to warn about
    // there), unless the ISO warning already named the lens as the cause.
    //
    // That "stayed at/under the soft cap" path requires post-clamp isoIdeal
    // to land at or below the 3200/6400 geometric midpoint, which needs
    // R > 2^gap, where R = (N_default/N_widest)^2 is the true optical ratio
    // and gap = apIdx - widestIdx. Under current constants this never holds:
    // standard f-numbers are rounded DOWN from their true stop values
    // (5.6 < 4*sqrt(2)=5.657, 2.8 < 2*sqrt(2)=2.828), so R sits just under
    // 2^gap for every full-stop pair (1.96 vs 2, 7.84 vs 8) — structural to
    // the f-number convention, not a near-miss. 5.6->2.8 is an exact tie
    // that still resolves to 6400 because the midpoint comparison is strict
    // <. The one sub-full-stop pair, shallow_dof's 2.0->1.8, is only 0.30
    // stops across a full grid index and fails hardest. A negative
    // EXPOSURE_BIAS_STOPS, or aperture grid entries spanning more than a
    // full stop, would make it reachable; changing ISO_SOFT_CAP would not,
    // since R > 2^gap is scale-invariant. Kept anyway: this guard and
    // isoWarningNamesLens together are the deliberate decoupling of two
    // independent facts (ISO exceeded the soft cap; the lens capped the
    // widen), and deleting the guard would re-couple them.
    // Verified unreachable under current constants across two sessions —
    // do not re-derive or sweep for it.
    warnings.push(`Limited to ${formatAperture(aperture)} by your lens.`);
  }

  // Step 12 — aperture-widening warning (standard intent only, shallow_dof is exempt)
  if (input.creative_intent === "standard" && aperture < 2.8) {
    warnings.push(apertureWidenedWarning(aperture));
  }

  // Step 13 — shutter-at-floor warning: the chosen shutter still equals the
  // binding floor from Step 3/4. Recomputed directly from `floor` (not a
  // stored pre-Step-7 snapshot) so it's correct in both directions — true
  // for dim/normal scenes where Step 7 never touched the shutter, false for
  // bright scenes where Step 7's speedup moved it away from the floor.
  // Fires regardless of support — a tripod doesn't eliminate a moving
  // subject's motion floor — but floorCause returns null for tripod's
  // stationary long-exposure allowance, which isn't a margin risk.
  if (shutter === slowestStandardShutterMeetingFloor(floor)) {
    const cause = floorCause(input);
    // The plain 1/focal_length_mm rule at a known focal length is the normal
    // handheld case — sitting at that floor is the standard rule of thumb,
    // not thin margin, and warning here every time would be noise (most dim
    // scenes land here). Only warn when the margin is genuinely thin: the
    // ultra-wide cap actually clamped the floor, or the focal length itself
    // was a guess (so the "shake" floor the rule depends on might be wrong).
    const shakeMarginGenuinelyThin =
      shakeFloorWasClamped(input.focal_length_mm) || input.focal_length_assumed;
    if (cause === "shake" && shakeMarginGenuinelyThin) {
      warnings.push(SHAKE_AT_FLOOR_WARNING);
    } else if (cause === "motion") {
      // Being at the motion floor always means zero margin for a moving
      // subject — that's genuinely worth flagging every time, unlike shake.
      warnings.push(MOTION_AT_FLOOR_WARNING);
    }
  }

  // Step 14 — final sanity warning
  if (input.support === "handheld" && shutter >= 1) {
    warnings.push("Shutter is 1 second or longer; tripod required for sharp results.");
  }

  // Step 15 — build output
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
