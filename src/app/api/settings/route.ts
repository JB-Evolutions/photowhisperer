// Per arch-spec-v3.1.md §1.1, §2.5, §4.3, §7 (POST /api/settings).
// Phase 6.5: wires the real classifier+calculator chain (src/api/orchestrate.ts)
// in place of the Phase 4 fake-shape stub.
import { NextResponse, type NextRequest } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTierLimit, utcQuotaPeriod } from "@/lib/quota";
import { getCameraProfile } from "@/lib/camera-profile";
import { getSettings, type OrchestrateResult } from "@/api/orchestrate";
import type { PriorContext } from "@/api/types";
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

function isFakeEnabled(): boolean {
  return (
    process.env.NODE_ENV !== "production" &&
    process.env.ALLOW_FAKE_SETTINGS === "true"
  );
}

interface SettingsRequestBody {
  conditions: string;
  session_id?: string;
  prior_context?: PriorContext;
}

type ValidateBodyResult =
  | { ok: true; value: SettingsRequestBody }
  | { ok: false; response: NextResponse };

function validateBody(body: unknown): ValidateBodyResult {
  if (typeof body !== "object" || body === null) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "validation", message: "Request body must be a JSON object." },
        { status: 400 }
      ),
    };
  }

  const { conditions, session_id, prior_context } = body as Record<
    string,
    unknown
  >;

  if (typeof conditions !== "string" || conditions.length < 1) {
    return {
      ok: false,
      response: NextResponse.json({
        status: "invalid_input",
        message: INVALID_INPUT_MESSAGE,
      }),
    };
  }

  if (conditions.length > 5000) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "validation", message: "conditions must be 5000 characters or fewer." },
        { status: 400 }
      ),
    };
  }

  if (session_id !== undefined) {
    if (typeof session_id !== "string" || !UUID_RE.test(session_id)) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: "validation", message: "session_id must be a valid UUID." },
          { status: 400 }
        ),
      };
    }
  }

  let priorContextValue: PriorContext | undefined;
  if (prior_context !== undefined) {
    if (typeof prior_context !== "object" || prior_context === null) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: "validation", message: "prior_context must be an object." },
          { status: 400 }
        ),
      };
    }
    const { user_msg, assistant_summary } = prior_context as Record<
      string,
      unknown
    >;
    if (typeof user_msg !== "string" || typeof assistant_summary !== "string") {
      return {
        ok: false,
        response: NextResponse.json(
          {
            error: "validation",
            message:
              "prior_context.user_msg and prior_context.assistant_summary must be strings.",
          },
          { status: 400 }
        ),
      };
    }
    priorContextValue = { user_msg, assistant_summary };
  }

  return {
    ok: true,
    value: {
      conditions,
      session_id: session_id as string | undefined,
      prior_context: priorContextValue,
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

// Read-only pre-check so an over-quota user never pays for a classifier call.
// The atomic check_and_increment_quota_with_credits RPC (called only after a
// successful classification) is the real, race-safe gate.
async function checkQuotaPreflight(
  supabase: SupabaseServerClient,
  userId: string,
  tierLimit: number,
  quotaMonth: number,
  quotaYear: number
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

  if (monthly_count < tierLimit || credits_remaining > 0) {
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

export async function POST(request: NextRequest) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // TODO(pre-launch): remove ?fake= stub + ALLOW_FAKE_SETTINGS before prod.
  // Listed in the deploy kill-list alongside ALLOW_TEST_LOGIN.
  if (isFakeEnabled()) {
    const fake = request.nextUrl.searchParams.get("fake");
    const OK_FIXTURE = {
      status: "ok",
      iso: 200,
      aperture: "f/1.8",
      shutter_speed: "1/500",
      white_balance: "daylight",
      color_temperature: "5500K",
      assumptions: ["Focal length assumed: 85mm"],
      warnings: ["High contrast — expose for highlights; shadows may clip"],
      scene_summary: "Golden hour backlit portrait.",
      credits_used: false,
      monthly_count: 1,
      credits_remaining: 4,
      session_id: "fake-session-1",
    };
    if (fake === "ok") {
      return NextResponse.json(OK_FIXTURE);
    }
    if (fake === "clarification") {
      return NextResponse.json({
        status: "clarification_required",
        question: "Is this indoors or outdoors, and is the subject moving?",
      });
    }
    if (fake === "invalid") {
      return NextResponse.json({
        status: "invalid_input",
        message: "Please describe your shooting conditions: lighting, subject, and movement.",
      });
    }
    if (fake === "error") {
      return NextResponse.json({
        status: "error",
        message: "Couldn't reach the photography service. Try again?",
      });
    }
    if (fake === "rate_limited") {
      return NextResponse.json({ error: "rate_limited" }, { status: 429 });
    }
    if (fake === "slow") {
      await new Promise((r) => setTimeout(r, 12000));
      return NextResponse.json(OK_FIXTURE);
    }
    if (fake === "hang") {
      await new Promise((r) => setTimeout(r, 35000));
      return NextResponse.json(OK_FIXTURE);
    }
    // absent or unknown fake param — fall through to live handling
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

  const validated = validateBody(rawBody);
  if (!validated.ok) {
    return validated.response;
  }
  const { conditions, session_id: requestedSessionId, prior_context } =
    validated.value;

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

    const preflight = await checkQuotaPreflight(supabase, user.id, tierLimit, quotaMonth, quotaYear);
    if (!preflight.ok) {
      return NextResponse.json(
        {
          error: "quota_exceeded",
          monthly_count: preflight.monthly_count,
          credits_remaining: preflight.credits_remaining,
        },
        { status: 429 }
      );
    }

    const camera_profile = await getCameraProfile(user.id);

    const result = await getSettings(
      conditions,
      camera_profile,
      prior_context ?? null
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

    if (result.status !== "ok") {
      return NextResponse.json(result);
    }

    const { data: quotaData, error: quotaError } = await admin
      .rpc("check_and_increment_quota_with_credits", {
        p_user_id: user.id,
        p_month: quotaMonth,
        p_year: quotaYear,
        p_tier_limit: tierLimit,
      })
      .single();
    if (quotaError) throw quotaError;
    const quota = quotaData as QuotaResult;

    if (!quota.success) {
      return NextResponse.json(
        {
          error: "quota_exceeded",
          monthly_count: quota.monthly_count,
          credits_remaining: quota.credits_remaining,
        },
        { status: 429 }
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

    await appendMessages(session_id, { text: conditions }, responsePayload);

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
