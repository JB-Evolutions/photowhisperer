import { describe, it, expect, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";

const { mockList } = vi.hoisted(() => ({ mockList: vi.fn() }));

// Spread the real module so APIError stays the actual SDK class — route.ts
// does `err instanceof APIError`, same reason orchestrate.test.ts mocks it
// this way. Only the default client constructor is overridden, to route
// models.list through mockList.
vi.mock("@anthropic-ai/sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@anthropic-ai/sdk")>();
  return {
    ...actual,
    default: vi.fn(() => ({
      models: { list: mockList },
    })),
  };
});

import { APIError } from "@anthropic-ai/sdk";
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
  mockList.mockReset();
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

function request(url: string) {
  return new NextRequest(url);
}

describe("GET /api/health", () => {
  it("returns 200 { status: \"ok\" } when all critical env vars are present", async () => {
    setEnv(ALL_PRESENT);
    const res = await GET(request("http://localhost/api/health"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ status: "ok" });
  });

  it("returns 503 { status: \"unhealthy\", reason: \"missing_env\" } when one var is missing, without naming it in the body", async () => {
    setEnv(ALL_PRESENT);
    delete process.env.SUPABASE_SECRET_KEY;

    const res = await GET(request("http://localhost/api/health"));
    expect(res.status).toBe(503);

    const bodyText = await res.text();
    expect(bodyText).not.toContain("SUPABASE_SECRET_KEY");
    expect(JSON.parse(bodyText)).toEqual({ status: "unhealthy", reason: "missing_env" });
  });

  it("returns 503 { status: \"unhealthy\", reason: \"missing_env\" } when all four vars are missing, without naming any in the body", async () => {
    clearAll();

    const res = await GET(request("http://localhost/api/health"));
    expect(res.status).toBe(503);

    const bodyText = await res.text();
    for (const key of Object.keys(ALL_PRESENT)) {
      expect(bodyText).not.toContain(key);
    }
    expect(JSON.parse(bodyText)).toEqual({ status: "unhealthy", reason: "missing_env" });
  });

  it("does not call the Anthropic client at all without ?deep=1 — the default path stays cheap", async () => {
    setEnv(ALL_PRESENT);

    const res = await GET(request("http://localhost/api/health"));

    expect(res.status).toBe(200);
    expect(mockList).not.toHaveBeenCalled();
  });

  it("?deep=1 with a healthy Anthropic response returns 200 ok", async () => {
    setEnv(ALL_PRESENT);
    mockList.mockResolvedValue({ data: [] });

    const res = await GET(request("http://localhost/api/health?deep=1"));

    expect(mockList).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });

  it("?deep=1 with APIError status 401 returns 503 reason anthropic_unauthorized, without leaking the key", async () => {
    setEnv(ALL_PRESENT);
    mockList.mockRejectedValue(
      new APIError(401, { type: "authentication_error" }, "Invalid API key", new Headers())
    );

    const res = await GET(request("http://localhost/api/health?deep=1"));
    expect(res.status).toBe(503);

    const bodyText = await res.text();
    expect(bodyText).not.toContain(ALL_PRESENT.ANTHROPIC_API_KEY);
    expect(JSON.parse(bodyText)).toEqual({ status: "unhealthy", reason: "anthropic_unauthorized" });
  });

  it("?deep=1 with a network error returns 503 reason anthropic_unreachable", async () => {
    setEnv(ALL_PRESENT);
    mockList.mockRejectedValue(new Error("fetch failed"));

    const res = await GET(request("http://localhost/api/health?deep=1"));

    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ status: "unhealthy", reason: "anthropic_unreachable" });
  });
});
