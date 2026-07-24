import { NextRequest, NextResponse } from "next/server";
import Anthropic, { APIError } from "@anthropic-ai/sdk";

// Server-only runtime secrets the live request path actually reads. Deliberately
// excludes NEXT_PUBLIC_* vars — those are build-time-inlined into the client
// bundle, so a runtime process.env check here would test the wrong resolution
// path, and their absence already surfaces loudly at build/hydration.
const CRITICAL_ENV_VARS = [
  "ANTHROPIC_API_KEY",
  "SUPABASE_SECRET_KEY",
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
] as const;

function isPresent(name: string): boolean {
  const value = process.env[name];
  return typeof value === "string" && value.length > 0;
}

const ANTHROPIC_HEALTH_TIMEOUT_MS = 5000;

type AnthropicCheckResult =
  | { ok: true }
  | { ok: false; reason: "anthropic_unauthorized" | "anthropic_unreachable" };

// Zero-completion-cost reachability check — models.list() is metadata only,
// no max_tokens, never touches the classifier budget. Bounded to 5s so a
// slow/hanging Anthropic can't make this endpoint hang; a health check that
// never returns is worse than one with narrow coverage.
async function checkAnthropicReachable(): Promise<AnthropicCheckResult> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ANTHROPIC_HEALTH_TIMEOUT_MS);
  try {
    await client.models.list(null, { signal: controller.signal });
    return { ok: true };
  } catch (err) {
    // Real error detail (never the key itself) stays server-side only —
    // same convention as the missing-env-vars log below.
    console.error("Health check: Anthropic reachability check failed:", err);
    if (err instanceof APIError && (err.status === 401 || err.status === 403)) {
      return { ok: false, reason: "anthropic_unauthorized" };
    }
    return { ok: false, reason: "anthropic_unreachable" };
  } finally {
    clearTimeout(timeout);
  }
}

export async function GET(request: NextRequest) {
  const missing = CRITICAL_ENV_VARS.filter((name) => !isPresent(name));

  if (missing.length > 0) {
    // Names only ever go server-side (Vercel logs) — the response body must
    // not name which var is missing, that's recon information for an attacker.
    console.error("Health check: missing required env vars:", missing);
    return NextResponse.json({ status: "unhealthy", reason: "missing_env" }, { status: 503 });
  }

  // Opt-in only: anything that polls this endpoint today or in the future
  // gets the instant env-presence-only check by default. The Anthropic call
  // — real network cost, real (if tiny) API usage — only runs when a caller
  // deliberately asks for it via ?deep=1. Prevents an unrelated monitor
  // silently turning every health poll into Anthropic traffic.
  const deep = request.nextUrl.searchParams.get("deep") === "1";
  if (!deep) {
    return NextResponse.json({ status: "ok" });
  }

  const anthropicCheck = await checkAnthropicReachable();
  if (!anthropicCheck.ok) {
    return NextResponse.json(
      { status: "unhealthy", reason: anthropicCheck.reason },
      { status: 503 }
    );
  }

  return NextResponse.json({ status: "ok" });
}
