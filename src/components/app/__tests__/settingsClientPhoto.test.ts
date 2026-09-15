import { afterEach, describe, expect, it, vi } from "vitest";
import { requestSettings, type SettingsImagePayload } from "@/lib/settingsClient";

function fakeResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

function sentBody(spy: { mock: { calls: unknown[][] } }): Record<string, unknown> {
  const init = spy.mock.calls[0][1] as RequestInit;
  return JSON.parse(init.body as string) as Record<string, unknown>;
}

const image: SettingsImagePayload = {
  jpegBase64: "AAAA",
  thumbnailBase64: "BBBB",
  exif: null,
  rawExifFlags: { hdrSuspect: false },
  histogram: { bins: [] } as unknown as SettingsImagePayload["histogram"],
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("requestSettings — photo contract", () => {
  it("maps any 413 to payload_too_large, even without a JSON body", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: false,
      status: 413,
      json: async () => { throw new Error("not json"); },
    } as unknown as Response);
    expect(await requestSettings("", null)).toEqual({ status: "payload_too_large" });
  });

  it("maps 429 quota_exhausted with unit counts to its own status", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      fakeResponse(429, { error: "quota_exhausted", units_required: 2, units_available: 1 }),
    );
    expect(await requestSettings("sunny park", null)).toEqual({
      status: "quota_exhausted",
      units_required: 2,
      units_available: 1,
    });
  });

  it("keeps 429 quota_exceeded unchanged", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      fakeResponse(429, { error: "quota_exceeded", monthly_count: 5, credits_remaining: 0 }),
    );
    expect(await requestSettings("sunny park", null)).toEqual({
      status: "quota_exceeded",
      monthly_count: 5,
      credits_remaining: 0,
    });
  });

  it("sends condition, intent and image when given", async () => {
    const spy = vi.spyOn(global, "fetch").mockResolvedValue(fakeResponse(200, { status: "ok" }));
    await requestSettings("", "s1", undefined, undefined, { condition: "overcast", intent: "moody", image });
    expect(sentBody(spy)).toEqual({
      conditions: "",
      session_id: "s1",
      condition: "overcast",
      intent: "moody",
      image,
    });
  });

  it("sends a null condition explicitly and omits a missing image", async () => {
    const spy = vi.spyOn(global, "fetch").mockResolvedValue(fakeResponse(200, { status: "ok" }));
    await requestSettings("street at dusk", null, undefined, undefined, { condition: null, intent: "natural" });
    const body = sentBody(spy);
    expect(body).toEqual({ conditions: "street at dusk", condition: null, intent: "natural" });
    expect("image" in body).toBe(false);
  });

  it("sends no condition keys without extras", async () => {
    const spy = vi.spyOn(global, "fetch").mockResolvedValue(fakeResponse(200, { status: "ok" }));
    await requestSettings("street at dusk", null);
    const body = sentBody(spy);
    expect("condition" in body).toBe(false);
    expect("intent" in body).toBe(false);
  });

  it("passes a null aperture through", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      fakeResponse(200, { status: "ok", aperture: null, floorExplain: "x", shortfallStops: 0 }),
    );
    const result = await requestSettings("dim bar", null);
    expect(result).toMatchObject({ status: "ok", aperture: null, shortfallStops: 0 });
  });
});
