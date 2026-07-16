// Post-deploy smoke test. No secrets, no auth — safe to run against prod
// anytime. Proves (1) critical server-only env vars are present via
// /api/health, and (2) proxy.ts is actually registered — per build-steps-v2.md
// Phase 3, an unauthenticated 401 on an API route proves nothing (in-handler
// auth checks would produce the same result even if middleware were dead);
// only a page-route redirect proves it.
//
// Usage: tsx scripts/smoke.ts [baseUrl]

export {}; // top-level await requires this file to be a module

const baseUrl = process.argv[2] ?? "https://photographywhisperer.com";

function fail(message: string): never {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

async function checkHealth() {
  const res = await fetch(new URL("/api/health", baseUrl), {
    redirect: "manual",
  });
  if (res.status !== 200) {
    fail(`/api/health returned ${res.status}, expected 200`);
  }
  const body = (await res.json()) as { status?: string };
  if (body.status !== "ok") {
    fail(`/api/health body status was ${JSON.stringify(body.status)}, expected "ok"`);
  }
}

async function checkAuthGate() {
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

try {
  await checkHealth();
  await checkAuthGate();
  console.log(`PASS: ${baseUrl} is healthy and proxy.ts is registered`);
  process.exit(0);
} catch (err) {
  fail(`unexpected error: ${err instanceof Error ? err.message : String(err)}`);
}
