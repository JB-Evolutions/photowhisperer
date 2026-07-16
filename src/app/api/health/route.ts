import { NextResponse } from "next/server";

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

export async function GET() {
  const missing = CRITICAL_ENV_VARS.filter((name) => !isPresent(name));

  if (missing.length > 0) {
    // Names only ever go server-side (Vercel logs) — the response body must
    // not name which var is missing, that's recon information for an attacker.
    console.error("Health check: missing required env vars:", missing);
    return NextResponse.json({ status: "unhealthy" }, { status: 503 });
  }

  return NextResponse.json({ status: "ok" });
}
