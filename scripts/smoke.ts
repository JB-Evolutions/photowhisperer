// Post-deploy smoke test. No secrets, no auth — safe to run against prod
// anytime. Proves (1) critical server-only env vars are present AND the
// configured ANTHROPIC_API_KEY actually authenticates against Anthropic's
// API, via /api/health?deep=1 (see src/app/api/health/route.ts — the deep
// check is opt-in so ordinary health polls stay free of Anthropic traffic;
// this script is the one caller in the repo that deliberately asks for it),
// and (2) proxy.ts is actually registered — per build-steps-v2.md Phase 3,
// an unauthenticated 401 on an API route proves nothing (in-handler auth
// checks would produce the same result even if middleware were dead); only
// a page-route redirect proves it.
//
// Usage: tsx scripts/smoke.ts [baseUrl]
// baseUrl defaults to the canonical www origin; pass a bare-apex arg only
// if you specifically want to exercise the apex→www redirect.

const baseUrl = process.argv[2] ?? "https://www.photographywhisperer.com";

function fail(message: string): never {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

async function checkHealth() {
  // follow: apex redirects to canonical www before hitting the app; the real user path goes through it
  // deep=1: exercises the Anthropic reachability check, not just env presence — see route.ts
  const res = await fetch(new URL("/api/health?deep=1", baseUrl), {
    redirect: "follow",
  });
  let body: { status?: string; reason?: string } = {};
  try {
    body = await res.json();
  } catch {
    // unparseable body — status check below still fires, just without a reason
  }
  if (res.status !== 200) {
    fail(
      `/api/health?deep=1 returned ${res.status}${body.reason ? ` (reason: ${body.reason})` : ""}, expected 200`
    );
  }
  if (body.status !== "ok") {
    fail(`/api/health?deep=1 body status was ${JSON.stringify(body.status)}, expected "ok"`);
  }
}

async function checkAuthGate() {
  // manual: the assertion is on the 307 itself, so it must not be auto-followed
  const res = await fetch(new URL("/app", baseUrl), {
    redirect: "manual",
  });
  if (res.status !== 307) {
    fail(`/app with no cookie returned ${res.status}, expected 307 (proves proxy.ts registered)`);
  }
  const location = res.headers.get("location") ?? "";
  if (!new URL(location, baseUrl).pathname.startsWith("/auth/signin")) {
    fail(`/app redirected to "${location}", expected /auth/signin`);
  }
}

async function main() {
  try {
    await checkHealth();
    await checkAuthGate();
    console.log(`PASS: ${baseUrl} is healthy, Anthropic is reachable, and proxy.ts is registered`);
    process.exit(0);
  } catch (err) {
    fail(`unexpected error: ${err instanceof Error ? err.message : String(err)}`);
  }
}

main();
