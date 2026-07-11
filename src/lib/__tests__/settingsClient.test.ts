import { describe, it, expect, vi, afterEach } from "vitest";
import { requestSettings } from "../settingsClient";

function fakeResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

describe("requestSettings — service_busy carve-out (503)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("503 + error:'service_busy' → status:'service_busy'", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      fakeResponse(503, { error: "service_busy", message: "Service is busy. Please try again in a moment." })
    );

    const result = await requestSettings("sunny day portrait", null);

    expect(result).toEqual({ status: "service_busy" });
  });

  it("503 with a different/missing error field does NOT map to service_busy (falls to generic error)", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(fakeResponse(503, {}));

    const result = await requestSettings("sunny day portrait", null);

    expect(result.status).toBe("error");
  });

  // ─── Regression guards — 429 quota_exceeded and 429 rate_limited stay distinct ─
  it("REGRESSION: 429 + error:'quota_exceeded' still maps to quota_exceeded, not service_busy", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      fakeResponse(429, { error: "quota_exceeded", monthly_count: 5, credits_remaining: 0 })
    );

    const result = await requestSettings("sunny day portrait", null);

    expect(result.status).toBe("quota_exceeded");
  });

  it("REGRESSION: 429 + error:'rate_limited' still maps to rate_limited, not service_busy", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(fakeResponse(429, { error: "rate_limited" }));

    const result = await requestSettings("sunny day portrait", null);

    expect(result).toEqual({ status: "rate_limited" });
  });

  it("REGRESSION: 401 still maps to a session-expired error message, not service_busy", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(fakeResponse(401, {}));

    const result = await requestSettings("sunny day portrait", null);

    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.message).toMatch(/session expired/i);
    }
  });

  it("200 status:'ok' response is unaffected", async () => {
    const okBody = {
      status: "ok",
      iso: 100,
      aperture: "f/5.6",
      shutter_speed: "1/1000",
      white_balance: "daylight",
      color_temperature: null,
      assumptions: [],
      warnings: [],
      credits_used: false,
      monthly_count: 1,
      credits_remaining: 4,
      session_id: "sess-1",
    };
    vi.spyOn(global, "fetch").mockResolvedValue(fakeResponse(200, okBody));

    const result = await requestSettings("sunny day portrait", null);

    expect(result.status).toBe("ok");
  });
});
