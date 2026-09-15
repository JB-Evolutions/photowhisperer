import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_RETRY_AFTER_SECONDS,
  MAX_RETRY_AFTER_SECONDS,
  parseRetryAfter,
  requestSettings,
} from "@/lib/settingsClient";

function fakeResponse(status: number, body: unknown, headers?: Record<string, string>) {
  return {
    ok: status >= 200 && status < 300,
    status,
    ...(headers ? { headers: new Headers(headers) } : {}),
    json: async () => body,
  } as unknown as Response;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("requestSettings — 503 gear_profile_unavailable", () => {
  it("maps to its own status and honours Retry-After", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      fakeResponse(503, { error: "gear_profile_unavailable" }, { "Retry-After": "10" }),
    );
    expect(await requestSettings("sunny park", null)).toEqual({
      status: "gear_profile_unavailable",
      retryAfterSeconds: 10,
    });
  });

  it("uses a shorter Retry-After as given", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      fakeResponse(503, { error: "gear_profile_unavailable" }, { "Retry-After": "3" }),
    );
    expect(await requestSettings("sunny park", null)).toEqual({
      status: "gear_profile_unavailable",
      retryAfterSeconds: 3,
    });
  });

  it("defaults to 10s when the header is missing or unreadable", async () => {
    expect(DEFAULT_RETRY_AFTER_SECONDS).toBe(10);
    const spy = vi.spyOn(global, "fetch");

    spy.mockResolvedValueOnce(fakeResponse(503, { error: "gear_profile_unavailable" }, {}));
    expect(await requestSettings("a", null)).toEqual({ status: "gear_profile_unavailable", retryAfterSeconds: 10 });

    spy.mockResolvedValueOnce(fakeResponse(503, { error: "gear_profile_unavailable" }));
    expect(await requestSettings("a", null)).toEqual({ status: "gear_profile_unavailable", retryAfterSeconds: 10 });

    spy.mockResolvedValueOnce(fakeResponse(503, { error: "gear_profile_unavailable" }, { "Retry-After": "soon" }));
    expect(await requestSettings("a", null)).toEqual({ status: "gear_profile_unavailable", retryAfterSeconds: 10 });
  });

  it("leaves the other 503 shapes alone", async () => {
    const spy = vi.spyOn(global, "fetch");

    spy.mockResolvedValueOnce(fakeResponse(503, { error: "service_busy" }, { "Retry-After": "10" }));
    expect(await requestSettings("a", null)).toEqual({ status: "service_busy" });

    spy.mockResolvedValueOnce(fakeResponse(503, {}, { "Retry-After": "10" }));
    expect((await requestSettings("a", null)).status).toBe("error");
  });
});

describe("parseRetryAfter", () => {
  const now = Date.UTC(2026, 8, 16, 12, 0, 0);

  it("reads delta-seconds", () => {
    expect(parseRetryAfter("10", now)).toBe(10);
    expect(parseRetryAfter(" 0 ", now)).toBe(0);
  });

  it("reads an HTTP-date relative to now, never negative", () => {
    expect(parseRetryAfter(new Date(now + 30_000).toUTCString(), now)).toBe(30);
    expect(parseRetryAfter(new Date(now - 30_000).toUTCString(), now)).toBe(0);
  });

  it("caps absurd waits", () => {
    expect(parseRetryAfter("99999", now)).toBe(MAX_RETRY_AFTER_SECONDS);
  });

  it("returns null for absent or unparseable values", () => {
    expect(parseRetryAfter(null, now)).toBeNull();
    expect(parseRetryAfter(undefined, now)).toBeNull();
    expect(parseRetryAfter("", now)).toBeNull();
    expect(parseRetryAfter("-5", now)).toBeNull();
    expect(parseRetryAfter("1.5", now)).toBeNull();
    expect(parseRetryAfter("soon", now)).toBeNull();
  });
});
