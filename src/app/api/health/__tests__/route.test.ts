import { describe, it, expect, afterEach } from "vitest";
import { GET } from "../route";

const ALL_PRESENT = {
  ANTHROPIC_API_KEY: "sk-ant-test",
  SUPABASE_SECRET_KEY: "sb_secret_test",
  UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
  UPSTASH_REDIS_REST_TOKEN: "upstash-token-test",
};

// Snapshot whatever these vars were before the suite ran (e.g. from
// .env.local) so afterEach restores the real state instead of wiping it —
// blind-deleting would leak into other test files sharing this worker.
const ORIGINAL_ENV: Record<string, string | undefined> = {};
for (const key of Object.keys(ALL_PRESENT)) {
  ORIGINAL_ENV[key] = process.env[key];
}

afterEach(() => {
  for (const key of Object.keys(ALL_PRESENT)) {
    const original = ORIGINAL_ENV[key];
    if (original === undefined) delete process.env[key];
    else process.env[key] = original;
  }
});

function setEnv(vars: Partial<typeof ALL_PRESENT>) {
  for (const [key, value] of Object.entries(vars)) {
    if (value !== undefined) process.env[key] = value;
  }
}

function clearAll() {
  for (const key of Object.keys(ALL_PRESENT)) {
    delete process.env[key];
  }
}

describe("GET /api/health", () => {
  it("returns 200 { status: \"ok\" } when all critical env vars are present", async () => {
    setEnv(ALL_PRESENT);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ status: "ok" });
  });

  it("returns 503 { status: \"unhealthy\" } when one var is missing, without naming it in the body", async () => {
    setEnv(ALL_PRESENT);
    delete process.env.SUPABASE_SECRET_KEY;

    const res = await GET();
    expect(res.status).toBe(503);

    const bodyText = await res.text();
    expect(bodyText).not.toContain("SUPABASE_SECRET_KEY");
    expect(JSON.parse(bodyText)).toEqual({ status: "unhealthy" });
  });

  it("returns 503 { status: \"unhealthy\" } when all four vars are missing, without naming any in the body", async () => {
    clearAll();

    const res = await GET();
    expect(res.status).toBe(503);

    const bodyText = await res.text();
    for (const key of Object.keys(ALL_PRESENT)) {
      expect(bodyText).not.toContain(key);
    }
    expect(JSON.parse(bodyText)).toEqual({ status: "unhealthy" });
  });
});
