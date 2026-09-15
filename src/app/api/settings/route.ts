// Per arch-spec-v3.1.md §1.1, §2.5, §4.3, §7 (POST /api/settings).
// Phase 6.5: wires the real classifier+calculator chain (src/api/orchestrate.ts)
// in place of the Phase 4 fake-shape stub.
import { after, NextResponse, type NextRequest } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTierLimit, utcQuotaPeriod } from "@/lib/quota";
import { getCameraProfile, getGearProfile } from "@/lib/camera-profile";
import { getSettings, type OrchestrateResult } from "@/api/orchestrate";
import type { CameraProfile, GearProfile, ImageInput, PriorContext } from "@/api/types";
import {
  INTENT_STOPS,
  LIGHT_CONDITION_EV,
  type BrightnessIntent,
  type LightCondition,
} from "@/lib/contract/types";
import { MAX_OUTPUT_BASE64_BYTES } from "@/lib/image/limits";
import {
  persistSessionThumbnail,
  THUMBNAIL_PERSISTENCE_ENABLED,
  type PersistThumbnailArgs,
} from "@/lib/session-thumbnail";
import {
  ensureSession,
  appendMessages,
  updateSessionTitle,
  generateTitleFromSummary,
} from "@/lib/sessions";
import { limitWithTimeout } from "@/lib/rate-limit";
import * as Sentry from "@sentry/nextjs";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const INVALID_INPUT_MESSAGE =
  "Please describe your shooting conditions: lighting, subject, and movement.";

// A photo request costs two quota units, text one. Charging is all-or-nothing.
const PHOTO_UNITS = 2;
const TEXT_UNITS = 1;

// A 256px JPEG at quality 0.85 is a few tens of KB; this is generous headroom.
const MAX_THUMBNAIL_BASE64_BYTES = 256 * 1024;

const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/;

const LIGHT_CONDITIONS = Object.keys(LIGHT_CONDITION_EV) as readonly LightCondition[];
const BRIGHTNESS_INTENTS = Object.keys(INTENT_STOPS) as readonly BrightnessIntent[];

type ImagePayload = ImageInput & { thumbnailBase64: string };

interface SettingsRequestBody {
  conditions: string;
  session_id?: string;
  prior_context?: PriorContext;
  condition: LightCondition | null;
  intent: BrightnessIntent;
  image?: ImagePayload;
}

type ValidateBodyResult =
  | { ok: true; value: SettingsRequestBody }
  | { ok: false; response: NextResponse };

function validationError(message: string): { ok: false; response: NextResponse } {
  return {
    ok: false,
    response: NextResponse.json({ error: "validation", message }, { status: 400 }),
  };
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

// Returns an error message, or null when value is plausibly a JPEG within size.
// base64 is ASCII, so string length is the byte count.
function jpegBase64Error(value: unknown, maxBytes: number, field: string): string | null {
  if (typeof value !== "string" || value.length === 0) {
    return `${field} must be a non-empty base64 string.`;
  }
  if (value.length > maxBytes) {
    return `${field} must be ${maxBytes} bytes or fewer.`;
  }
  if (value.length % 4 !== 0 || !BASE64_RE.test(value)) {
    return `${field} must be valid base64.`;
  }
  // JPEG start-of-image marker FF D8 FF. 8 base64 chars decode to 6 bytes.
  const head = Buffer.from(value.slice(0, 8), "base64");
  if (head.length < 3 || head[0] !== 0xff || head[1] !== 0xd8 || head[2] !== 0xff) {
    return `${field} must be a JPEG image.`;
  }
  return null;
}

function validateImage(raw: unknown): { ok: true; value: ImagePayload } | { ok: false; message: string } {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ok: false, message: "image must be an object." };
  }
  const { jpegBase64, thumbnailBase64, exif, rawExifFlags, histogram } = raw as Record<string, unknown>;

  const jpegError = jpegBase64Error(jpegBase64, MAX_OUTPUT_BASE64_BYTES, "image.jpegBase64");
  if (jpegError) return { ok: false, message: jpegError };
  // Validated whether or not thumbnails are persisted.
  const thumbError = jpegBase64Error(thumbnailBase64, MAX_THUMBNAIL_BASE64_BYTES, "image.thumbnailBase64");
  if (thumbError) return { ok: false, message: thumbError };

  let exifValue: ImageInput["exif"] = null;
  if (exif !== null) {
    if (typeof exif !== "object" || exif === undefined) {
      return { ok: false, message: "image.exif must be an object or null." };
    }
    const { fNumber, exposureTimeS, iso, exposureBiasEv } = exif as Record<string, unknown>;
    if (
      !isFiniteNumber(fNumber) || fNumber <= 0 ||
      !isFiniteNumber(exposureTimeS) || exposureTimeS <= 0 ||
      !isFiniteNumber(iso) || iso <= 0 ||
      !isFiniteNumber(exposureBiasEv)
    ) {
      return {
        ok: false,
        message:
          "image.exif fNumber, exposureTimeS and iso must be positive numbers and exposureBiasEv a number.",
      };
    }
    exifValue = { fNumber, exposureTimeS, iso, exposureBiasEv };
  }

  if (
    typeof rawExifFlags !== "object" ||
    rawExifFlags === null ||
    typeof (rawExifFlags as Record<string, unknown>).hdrSuspect !== "boolean"
  ) {
    return { ok: false, message: "image.rawExifFlags.hdrSuspect must be a boolean." };
  }

  if (typeof histogram !== "object" || histogram === null) {
    return { ok: false, message: "image.histogram must be an object." };
  }
  const { shadowClipPct, highlightClipPct } = histogram as Record<string, unknown>;
  if (
    !isFiniteNumber(shadowClipPct) || shadowClipPct < 0 || shadowClipPct > 100 ||
    !isFiniteNumber(highlightClipPct) || highlightClipPct < 0 || highlightClipPct > 100
  ) {
    return { ok: false, message: "image.histogram percentages must be numbers from 0 to 100." };
  }

  return {
    ok: true,
    value: {
      jpegBase64: jpegBase64 as string,
      thumbnailBase64: thumbnailBase64 as string,
      exif: exifValue,
      rawExifFlags: { hdrSuspect: (rawExifFlags as { hdrSuspect: boolean }).hdrSuspect },
      histogram: { shadowClipPct, highlightClipPct },
    },
  };
}

function validateBody(body: unknown): ValidateBodyResult {
  if (typeof body !== "object" || body === null) {
    return validationError("Request body must be a JSON object.");
  }

  const { conditions, session_id, prior_context, condition, intent, image } =
    body as Record<string, unknown>;

  // A photo may be sent with no words; text alone must say something.
  if (typeof conditions !== "string" || (conditions.length < 1 && image === undefined)) {
    return {
      ok: false,
      response: NextResponse.json({
        status: "invalid_input",
        message: INVALID_INPUT_MESSAGE,
      }),
    };
  }

  if (conditions.length > 1000) {
    return validationError("conditions must be 1000 characters or fewer.");
  }

  if (session_id !== undefined) {
    if (typeof session_id !== "string" || !UUID_RE.test(session_id)) {
      return validationError("session_id must be a valid UUID.");
    }
  }

  let priorContextValue: PriorContext | undefined;
  if (prior_context !== undefined) {
    if (typeof prior_context !== "object" || prior_context === null) {
      return validationError("prior_context must be an object.");
    }
    const { user_msg, assistant_summary } = prior_context as Record<
      string,
      unknown
    >;
    if (typeof user_msg !== "string" || typeof assistant_summary !== "string") {
      return validationError(
        "prior_context.user_msg and prior_context.assistant_summary must be strings."
      );
    }
    priorContextValue = { user_msg, assistant_summary };
  }

  if (
    condition !== undefined &&
    condition !== null &&
    !LIGHT_CONDITIONS.includes(condition as LightCondition)
  ) {
    return validationError("condition must be a known light condition or null.");
  }

  if (intent !== undefined && !BRIGHTNESS_INTENTS.includes(intent as BrightnessIntent)) {
    return validationError("intent must be 'moody', 'natural' or 'bright'.");
  }

  let imageValue: ImagePayload | undefined;
  if (image !== undefined) {
    const result = validateImage(image);
    if (!result.ok) return validationError(result.message);
    imageValue = result.value;
  }

  return {
    ok: true,
    value: {
      conditions,
      session_id: session_id as string | undefined,
      prior_context: priorContextValue,
      condition: (condition as LightCondition | null | undefined) ?? null,
      intent: (intent as BrightnessIntent | undefined) ?? "natural",
      image: imageValue,
    },
  };
}

interface QuotaResult {
  success: boolean;
  monthly_count: number;
  credits_used: boolean;
  credits_remaining: number;
}

type SupabaseServerClient = Awaited<ReturnType<typeof createServerClient>>;

function unitsAvailable(tierLimit: number, monthlyCount: number, creditsRemaining: number): number {
  return Math.max(0, tierLimit - monthlyCount) + Math.max(0, creditsRemaining);
}

// Nothing left at all keeps the existing quota_exceeded shape (the
// OutOfCreditsCard). Some left but fewer than this request needs is
// quota_exhausted, which tells the user the photo cost and that nothing was
// consumed.
function quotaBlockedResponse(
  units: number,
  tierLimit: number,
  monthly_count: number,
  credits_remaining: number
): NextResponse {
  const available = unitsAvailable(tierLimit, monthly_count, credits_remaining);
  if (available > 0 && units > available) {
    return NextResponse.json(
      { error: "quota_exhausted", units_required: units, units_available: available },
      { status: 429 }
    );
  }
  return NextResponse.json(
    { error: "quota_exceeded", monthly_count, credits_remaining },
    { status: 429 }
  );
}

// Read-only pre-check so an over-quota user never pays for a classifier call.
// The atomic check_and_increment_quota_with_credits RPC (called only after a
// successful classification) is the real, race-safe gate.
async function checkQuotaPreflight(
  supabase: SupabaseServerClient,
  userId: string,
  tierLimit: number,
  quotaMonth: number,
  quotaYear: number,
  units: number
): Promise<
  { ok: true } | { ok: false; monthly_count: number; credits_remaining: number }
> {
  if (tierLimit === -1) return { ok: true };

  const [{ data: usage }, { data: credits }] = await Promise.all([
    supabase
      .from("usage_tracking")
      .select("request_count")
      .eq("user_id", userId)
      .eq("month", quotaMonth)
      .eq("year", quotaYear)
      .maybeSingle(),
    supabase
      .from("credit_balances")
      .select("credits_remaining")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  const monthly_count = usage?.request_count ?? 0;
  const credits_remaining = credits?.credits_remaining ?? 0;

  if (unitsAvailable(tierLimit, monthly_count, credits_remaining) >= units) {
    return { ok: true };
  }
  return { ok: false, monthly_count, credits_remaining };
}

function isValidOrchestrateResult(result: OrchestrateResult): boolean {
  switch (result.status) {
    case "clarification_required":
      return typeof result.question === "string";
    case "invalid_input":
    case "error":
      return typeof result.message === "string";
    case "service_busy":
      return true;
    case "ok":
      return (
        typeof result.iso === "number" &&
        typeof result.aperture === "string" &&
        typeof result.shutter_speed === "string" &&
        typeof result.white_balance === "string" &&
        (result.color_temperature === null ||
          typeof result.color_temperature === "string") &&
        Array.isArray(result.assumptions) &&
        Array.isArray(result.warnings)
      );
    default:
      return false;
  }
}

// Runs after the response is sent. persistSessionThumbnail never rejects, and
// scheduling itself can't fail the request either.
function scheduleThumbnail(args: PersistThumbnailArgs): void {
  if (!THUMBNAIL_PERSISTENCE_ENABLED) return;
  const task = async () => {
    await persistSessionThumbnail(args);
  };
  try {
    after(task);
  } catch (err) {
    console.warn(`session-thumbnail: after() unavailable for session ${args.sessionId}, running detached:`, err);
    void task();
  }
}

export async function POST(request: NextRequest) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json(
      { error: "validation", message: "Request body must be valid JSON." },
      { status: 400 }
    );
  }

  // Before the rate limiter and quota: a rejected body costs the user nothing.
  const validated = validateBody(rawBody);
  if (!validated.ok) {
    return validated.response;
  }
  const {
    conditions,
    session_id: requestedSessionId,
    prior_context,
    condition,
    intent,
    image,
  } = validated.value;
  const units = image ? PHOTO_UNITS : TEXT_UNITS;

  let rl;
  try {
    rl = await limitWithTimeout(user.id); // user.id = authenticated Supabase user, NEVER IP
  } catch (err) {
    console.error("rate limit check failed (fail-closed):", err);
    // A Redis blip isn't a crash — warning, not captureException. user_id
    // only: `conditions`/`prior_context` are already in scope at this point
    // in the handler, but must never be passed here.
    Sentry.captureMessage("rate limiter failed closed", {
      level: "warning",
      tags: { rate_limit_faildown: "true", route: "/api/settings" },
      extra: { user_id: user.id },
    });
    return NextResponse.json(
      { error: "service_busy", message: "Service is busy. Please try again in a moment." },
      { status: 503, headers: { "Retry-After": "10" } }
    );
  }
  if (!rl.success) {
    const retryAfter = Math.max(1, Math.ceil((rl.reset - Date.now()) / 1000));
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(retryAfter) } }
    );
  }

  // Any unexpected failure here (DB error etc.) must degrade to a client-facing
  // status:'error' shape rather than leaking a 500 with internals (screen-spec §4.8).
  try {
    const admin = createAdminClient();

    const { data: subscription } = await supabase
      .from("subscriptions")
      .select("tier")
      .eq("user_id", user.id)
      .maybeSingle();
    const tier = subscription?.tier ?? "snapshot";
    const tierLimit = getTierLimit(tier);

    // Compute once — both preflight and the atomic RPC must use the same
    // timestamp so they cannot straddle a UTC midnight boundary.
    const { quotaMonth, quotaYear } = utcQuotaPeriod();

    const preflight = await checkQuotaPreflight(
      supabase,
      user.id,
      tierLimit,
      quotaMonth,
      quotaYear,
      units
    );
    if (!preflight.ok) {
      return quotaBlockedResponse(
        units,
        tierLimit,
        preflight.monthly_count,
        preflight.credits_remaining
      );
    }

    // Structured profile first; the legacy free-text profile is the fallback
    // if the structured read fails.
    let camera_profile: GearProfile | CameraProfile | null;
    try {
      camera_profile = await getGearProfile(user.id);
    } catch (err) {
      console.error("getGearProfile failed, falling back to legacy camera profile:", err);
      camera_profile = await getCameraProfile(user.id);
    }

    // One clarification per session. If the flag can't be read, assume it
    // was used: answering with a stated assumption beats asking twice.
    let clarificationUsed = false;
    if (requestedSessionId) {
      const { data: sessionFlags, error: flagReadError } = await admin
        .from("sessions")
        .select("clarification_used")
        .eq("session_id", requestedSessionId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (flagReadError) {
        console.error("clarification_used read failed, treating as used:", flagReadError);
        clarificationUsed = true;
      } else {
        clarificationUsed = sessionFlags?.clarification_used === true;
      }
    }

    const result = await getSettings(
      conditions,
      camera_profile,
      prior_context ?? null,
      {
        // The thumbnail never goes to the classifier.
        image: image
          ? {
              jpegBase64: image.jpegBase64,
              exif: image.exif,
              rawExifFlags: image.rawExifFlags,
              histogram: image.histogram,
            }
          : null,
        condition,
        intent,
        clarificationUsed,
      }
    );

    if (!isValidOrchestrateResult(result)) {
      return NextResponse.json({
        status: "error",
        message: "Unexpected response shape",
      });
    }

    if (result.status === "service_busy") {
      // Same shape/status as the rate-limiter fail-closed 503 above — one
      // client-side branch (settingsClient.ts's `res.status === 503 &&
      // errorField === "service_busy"`) handles both sources.
      return NextResponse.json(
        { error: "service_busy", message: "Service is busy. Please try again in a moment." },
        { status: 503, headers: { "Retry-After": "10" } }
      );
    }

    // thumbnailPath starts null and is filled in after the response, if the
    // upload succeeds.
    const userContent: { text: string; thumbnailPath?: string | null } = image
      ? { text: conditions, thumbnailPath: null }
      : { text: conditions };

    if (result.status === "clarification_required") {
      // No quota charge. The session exists from here so the cap has a row
      // to live on; the flag is set before the question is returned.
      const { session_id } = await ensureSession(user.id, requestedSessionId);
      const { error: flagWriteError } = await admin
        .from("sessions")
        .update({ clarification_used: true })
        .eq("session_id", session_id)
        .eq("user_id", user.id);
      if (flagWriteError) throw flagWriteError;

      const clarificationPayload = {
        status: result.status,
        question: result.question,
        session_id,
      };
      await appendMessages(session_id, userContent, clarificationPayload);
      if (image) {
        scheduleThumbnail({
          userId: user.id,
          sessionId: session_id,
          text: conditions,
          thumbnailBase64: image.thumbnailBase64,
        });
      }
      return NextResponse.json(clarificationPayload);
    }

    if (result.status !== "ok") {
      return NextResponse.json(result);
    }

    // p_units is attached only when a request costs more than one unit. The
    // function's p_units defaults to 1 server-side (015_structured_profiles.sql),
    // so a text request's 4-arg call charges the same — and the unowned
    // quota-period.test.ts pins that exact 4-key argument set.
    const rpcArgs: {
      p_user_id: string;
      p_month: number;
      p_year: number;
      p_tier_limit: number;
      p_units?: number;
    } = {
      p_user_id: user.id,
      p_month: quotaMonth,
      p_year: quotaYear,
      p_tier_limit: tierLimit,
    };
    if (units > 1) rpcArgs.p_units = units;

    const { data: quotaData, error: quotaError } = await admin
      .rpc("check_and_increment_quota_with_credits", rpcArgs)
      .single();
    if (quotaError) throw quotaError;
    const quota = quotaData as QuotaResult;

    if (!quota.success) {
      return quotaBlockedResponse(
        units,
        tierLimit,
        quota.monthly_count,
        quota.credits_remaining
      );
    }

    const { session_id, was_created } = await ensureSession(
      user.id,
      requestedSessionId
    );

    const responsePayload = {
      ...result,
      credits_used: quota.credits_used,
      monthly_count: quota.monthly_count,
      credits_remaining: quota.credits_remaining,
      session_id,
    };

    await appendMessages(session_id, userContent, responsePayload);
    if (image) {
      scheduleThumbnail({
        userId: user.id,
        sessionId: session_id,
        text: conditions,
        thumbnailBase64: image.thumbnailBase64,
      });
    }

    let needsTitle = was_created;
    if (!needsTitle) {
      const { data: sessionRow } = await admin
        .from("sessions")
        .select("title")
        .eq("session_id", session_id)
        .maybeSingle();
      needsTitle = !sessionRow?.title;
    }
    if (needsTitle) {
      await updateSessionTitle(
        session_id,
        generateTitleFromSummary(result.scene_summary ?? "Untitled session")
      );
    }

    return NextResponse.json(responsePayload);
  } catch (err) {
    console.error("POST /api/settings ok-path failure:", err);
    return NextResponse.json({
      status: "error",
      message: "Couldn't process that — try again?",
    });
  }
}
