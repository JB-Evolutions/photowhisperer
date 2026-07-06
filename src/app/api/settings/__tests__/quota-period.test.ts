// Guards the straddle-midnight fix: utcQuotaPeriod() must be called exactly
// once per request, and its return values must reach BOTH the usage_tracking
// preflight query and the check_and_increment_quota_with_credits RPC — never
// a second fresh Date() call that could land in the next UTC month.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

// --- hoisted spies (must exist before vi.mock hoisting resolves) ---
const { rpcSpy, utcQuotaPeriodSpy, usageEqCalls, makeQueryBuilder } = vi.hoisted(() => {
  const usageEqCalls: Array<[string, unknown]> = [];

  function makeQueryBuilder(data: unknown, eqTracker?: typeof usageEqCalls) {
    const b: Record<string, unknown> = {};
    b.select = () => b;
    b.eq = (col: string, val: unknown) => { eqTracker?.push([col, val]); return b; };
    b.maybeSingle = async () => ({ data, error: null });
    b.single = async () => ({ data, error: null });
    b.update = () => b;
    return b;
  }

  return {
    rpcSpy: vi.fn(),
    utcQuotaPeriodSpy: vi.fn(),
    usageEqCalls,
    makeQueryBuilder,
  };
});

// --- module mocks ---
vi.mock("@/lib/quota", () => ({
  utcQuotaPeriod: utcQuotaPeriodSpy,
  getTierLimit: () => 5,
}));

vi.mock("@/lib/rate-limit", () => ({
  limitWithTimeout: vi.fn(async () => ({ success: true, reset: Date.now() + 60_000 })),
}));

vi.mock("@/lib/camera-profile", () => ({
  getCameraProfile: vi.fn(async () => null),
}));

vi.mock("@/api/orchestrate", () => ({
  getSettings: vi.fn(async () => ({
    status: "ok",
    iso: 400,
    aperture: "f/4",
    shutter_speed: "1/60",
    white_balance: "auto",
    color_temperature: null,
    assumptions: [],
    warnings: [],
    scene_summary: "Overcast outdoor portrait.",
  })),
}));

vi.mock("@/lib/sessions", () => ({
  ensureSession: vi.fn(async () => ({ session_id: "sess-abc", was_created: false })),
  appendMessages: vi.fn(async () => {}),
  updateSessionTitle: vi.fn(async () => {}),
  generateTitleFromSummary: vi.fn((s: string) => s),
}));

vi.mock("@sentry/nextjs", () => ({
  captureMessage: vi.fn(),
  captureException: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getUser: vi.fn(async () => ({ data: { user: { id: "user-abc" } } })),
    },
    from: vi.fn((table: string) => {
      if (table === "subscriptions") return makeQueryBuilder({ tier: "snapshot" });
      if (table === "usage_tracking") return makeQueryBuilder({ request_count: 0 }, usageEqCalls);
      if (table === "credit_balances") return makeQueryBuilder({ credits_remaining: 0 });
      return makeQueryBuilder(null);
    }),
  })),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    rpc: rpcSpy,
    from: vi.fn((table: string) =>
      makeQueryBuilder(table === "sessions" ? { title: "Existing title" } : null)
    ),
  })),
}));

// --- import handler after mocks are registered ---
import { POST } from "../route";

// --- helpers ---
function makeRequest() {
  return new NextRequest("http://localhost/api/settings", {
    method: "POST",
    body: JSON.stringify({ conditions: "overcast outdoors, still subject" }),
    headers: { "Content-Type": "application/json" },
  });
}

// --- tests ---

// Incremented inside the mockImplementation — reset to 0 in each beforeEach.
// The second call to utcQuotaPeriodSpy returns a DIFFERENT month (August), so
// any straddle (preflight using call 1, RPC using call 2) causes the
// "same value threaded to both sinks" assertion to break rather than the
// call-count assertion alone.
let utcCallCount = 0;

describe("POST /api/settings — quota period computed once and threaded correctly", () => {
  beforeEach(() => {
    utcCallCount = 0;
    usageEqCalls.length = 0;
    utcQuotaPeriodSpy.mockReset().mockImplementation(() => {
      utcCallCount++;
      return utcCallCount === 1
        ? { quotaMonth: 7, quotaYear: 2026 }
        : { quotaMonth: 8, quotaYear: 2026 }; // any second call yields August
    });
    rpcSpy.mockReset().mockReturnValue({
      single: vi.fn().mockResolvedValue({
        data: { success: true, monthly_count: 1, credits_used: false, credits_remaining: 0 },
        error: null,
      }),
    });
  });

  it("calls utcQuotaPeriod exactly once per request", async () => {
    await POST(makeRequest());
    expect(utcQuotaPeriodSpy).toHaveBeenCalledTimes(1);
  });

  it("threads quotaMonth and quotaYear to the usage_tracking preflight eq filters", async () => {
    await POST(makeRequest());
    expect(usageEqCalls).toContainEqual(["month", 7]);
    expect(usageEqCalls).toContainEqual(["year", 2026]);
  });

  it("threads the same quotaMonth and quotaYear to the RPC p_month/p_year", async () => {
    await POST(makeRequest());
    expect(rpcSpy).toHaveBeenCalledWith("check_and_increment_quota_with_credits", {
      p_user_id: "user-abc",
      p_month: 7,
      p_year: 2026,
      p_tier_limit: 5,
    });
  });

  it("preflight and RPC see the same month value (proves no straddle between the two sinks)", async () => {
    await POST(makeRequest());
    // Derive from the actual call records — not from the hardcoded constant —
    // so this assertion proves equality between the two sinks, not just that
    // both equal 7.
    const preflightMonth = usageEqCalls.find(([col]) => col === "month")?.[1];
    const rpcMonth = (rpcSpy.mock.calls[0][1] as Record<string, unknown>).p_month;
    expect(preflightMonth).toBeDefined();
    expect(rpcMonth).toBeDefined();
    expect(preflightMonth).toBe(rpcMonth);
  });
});
