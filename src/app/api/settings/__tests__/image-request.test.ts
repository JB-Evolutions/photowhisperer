// Photo requests on POST /api/settings: body validation (400 before any quota
// or classifier work), unit-based charging (p_units only on photos), the
// all-or-nothing quota_exhausted response, and the one-per-session
// clarification flag.
import { describe, it, expect, beforeEach, vi } from "vitest";

const {
  rpcSpy,
  getSettingsSpy,
  getGearProfileSpy,
  limitSpy,
  appendMessagesSpy,
  ensureSessionSpy,
  afterSpy,
  persistSpy,
  sessionUpdateSpy,
  state,
  makeQueryBuilder,
} = vi.hoisted(() => {
  const state = {
    requestCount: 0,
    creditsRemaining: 0,
    clarificationUsed: false as boolean,
  };

  function makeQueryBuilder(data: unknown, onUpdate?: (payload: unknown) => void) {
    const b: Record<string, unknown> = {};
    b.select = () => b;
    b.eq = () => b;
    b.maybeSingle = async () => ({ data, error: null });
    b.single = async () => ({ data, error: null });
    b.update = (payload: unknown) => {
      onUpdate?.(payload);
      return b;
    };
    return b;
  }

  return {
    rpcSpy: vi.fn(),
    getSettingsSpy: vi.fn(),
    getGearProfileSpy: vi.fn(async (..._args: unknown[]): Promise<unknown> => null),
    limitSpy: vi.fn(async () => ({ success: true, reset: Date.now() + 60_000 })),
    appendMessagesSpy: vi.fn(async (..._args: unknown[]) => ({
      userMessageId: "msg-user-1",
      assistantMessageId: "msg-assistant-1",
    })),
    ensureSessionSpy: vi.fn(async () => ({
      session_id: "11111111-1111-4111-8111-111111111111",
      was_created: false,
    })),
    afterSpy: vi.fn(),
    persistSpy: vi.fn(async () => null),
    sessionUpdateSpy: vi.fn(),
    state,
    makeQueryBuilder,
  };
});

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, after: afterSpy };
});

vi.mock("@/lib/quota", () => ({
  utcQuotaPeriod: () => ({ quotaMonth: 7, quotaYear: 2026 }),
  getTierLimit: () => 5,
}));

vi.mock("@/lib/rate-limit", () => ({ limitWithTimeout: limitSpy }));

vi.mock("@/lib/camera-profile", () => ({
  getGearProfile: getGearProfileSpy,
  // Present so a legacy fallback, if one crept back in, would be observable
  // rather than a mock-access throw.
  getCameraProfile: vi.fn(async () => ({ body: "legacy", lenses: [], flash: null, notes: null })),
}));

vi.mock("@/api/orchestrate", () => ({ getSettings: getSettingsSpy }));

vi.mock("@/lib/session-thumbnail", () => ({
  THUMBNAIL_PERSISTENCE_ENABLED: true,
  persistSessionThumbnail: persistSpy,
}));

vi.mock("@/lib/sessions", () => ({
  ensureSession: ensureSessionSpy,
  appendMessages: appendMessagesSpy,
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
      if (table === "usage_tracking") return makeQueryBuilder({ request_count: state.requestCount });
      if (table === "credit_balances") return makeQueryBuilder({ credits_remaining: state.creditsRemaining });
      return makeQueryBuilder(null);
    }),
  })),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    rpc: rpcSpy,
    from: vi.fn((table: string) =>
      table === "sessions"
        ? makeQueryBuilder(
            { title: "Existing title", clarification_used: state.clarificationUsed },
            sessionUpdateSpy
          )
        : makeQueryBuilder(null)
    ),
  })),
}));

import { NextRequest } from "next/server";
import { POST } from "../route";
import { MAX_OUTPUT_BASE64_BYTES } from "@/lib/image/limits";

const SESSION_ID = "11111111-1111-4111-8111-111111111111";

// Smallest plausible JPEG: SOI, a JFIF APP0 stub, EOI.
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0xff, 0xd9]).toString("base64");
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]).toString("base64");

function validImage(overrides: Record<string, unknown> = {}) {
  return {
    jpegBase64: JPEG,
    thumbnailBase64: JPEG,
    exif: { fNumber: 2.8, exposureTimeS: 1 / 60, iso: 400, exposureBiasEv: 0 },
    rawExifFlags: { hdrSuspect: false },
    histogram: { shadowClipPct: 1.2, highlightClipPct: 0.4 },
    ...overrides,
  };
}

const OK_RESULT = {
  status: "ok",
  iso: 400,
  aperture: "f/2.8",
  shutter_speed: "1/60",
  white_balance: "auto",
  color_temperature: null,
  assumptions: [],
  warnings: [],
  scene_summary: "Indoor portrait.",
  floorExplain: "1/60 keeps a still subject sharp handheld at 50mm.",
  shortfallStops: 0,
};

function post(body: Record<string, unknown>) {
  return POST(
    new NextRequest("http://localhost/api/settings", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    })
  );
}

function quotaRpc(data: Record<string, unknown>) {
  rpcSpy.mockReturnValue({ single: vi.fn().mockResolvedValue({ data, error: null }) });
}

describe("POST /api/settings — photo requests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.requestCount = 0;
    state.creditsRemaining = 0;
    state.clarificationUsed = false;
    getSettingsSpy.mockResolvedValue(OK_RESULT);
    quotaRpc({ success: true, monthly_count: 2, credits_used: false, credits_remaining: 0 });
  });

  describe("quota units", () => {
    it("a photo request calls the RPC with p_units: 2", async () => {
      const res = await post({ conditions: "", condition: null, intent: "natural", image: validImage() });

      expect(res.status).toBe(200);
      expect(rpcSpy).toHaveBeenCalledTimes(1);
      expect(rpcSpy).toHaveBeenCalledWith("check_and_increment_quota_with_credits", {
        p_user_id: "user-abc",
        p_month: 7,
        p_year: 2026,
        p_tier_limit: 5,
        p_units: 2,
      });
    });

    it("a text request calls the RPC with no p_units key at all", async () => {
      const res = await post({ conditions: "overcast park portrait", condition: "overcast", intent: "natural" });

      expect(res.status).toBe(200);
      const args = rpcSpy.mock.calls[0][1] as Record<string, unknown>;
      expect(Object.prototype.hasOwnProperty.call(args, "p_units")).toBe(false);
      expect(args).toEqual({ p_user_id: "user-abc", p_month: 7, p_year: 2026, p_tier_limit: 5 });
    });

    it("preflight: fewer units left than a photo needs → 429 quota_exhausted, classifier never called", async () => {
      state.requestCount = 4; // 1 of 5 left, no credits

      const res = await post({ conditions: "portrait", image: validImage() });

      expect(res.status).toBe(429);
      expect(await res.json()).toEqual({ error: "quota_exhausted", units_required: 2, units_available: 1 });
      expect(getSettingsSpy).not.toHaveBeenCalled();
      expect(rpcSpy).not.toHaveBeenCalled();
    });

    it("preflight: the same single remaining unit still covers a text request", async () => {
      state.requestCount = 4;

      const res = await post({ conditions: "overcast portrait" });

      expect(res.status).toBe(200);
      expect(getSettingsSpy).toHaveBeenCalledTimes(1);
    });

    it("preflight: nothing left → the existing quota_exceeded shape", async () => {
      state.requestCount = 5;

      const res = await post({ conditions: "portrait", image: validImage() });

      expect(res.status).toBe(429);
      expect(await res.json()).toEqual({ error: "quota_exceeded", monthly_count: 5, credits_remaining: 0 });
    });

    it("RPC refuses a photo (race) → 429 quota_exhausted and no message is saved", async () => {
      quotaRpc({ success: false, monthly_count: 5, credits_used: false, credits_remaining: 1 });

      const res = await post({ conditions: "portrait", image: validImage() });

      expect(res.status).toBe(429);
      expect(await res.json()).toEqual({ error: "quota_exhausted", units_required: 2, units_available: 1 });
      expect(appendMessagesSpy).not.toHaveBeenCalled();
    });
  });

  describe("image handling", () => {
    it("passes the image (without the thumbnail) and condition/intent to getSettings", async () => {
      await post({
        conditions: "portrait",
        session_id: SESSION_ID,
        condition: "indoor_window",
        intent: "bright",
        image: validImage(),
      });

      const [text, , , options] = getSettingsSpy.mock.calls[0];
      expect(text).toBe("portrait");
      expect(options).toEqual({
        image: {
          jpegBase64: JPEG,
          exif: { fNumber: 2.8, exposureTimeS: 1 / 60, iso: 400, exposureBiasEv: 0 },
          rawExifFlags: { hdrSuspect: false },
          histogram: { shadowClipPct: 1.2, highlightClipPct: 0.4 },
        },
        condition: "indoor_window",
        intent: "bright",
        clarificationUsed: false,
      });
    });

    it("saves the user message with thumbnailPath null and schedules the thumbnail after the response", async () => {
      const res = await post({ conditions: "portrait", image: validImage() });

      expect(res.status).toBe(200);
      expect(appendMessagesSpy.mock.calls[0][1]).toEqual({ text: "portrait", thumbnailPath: null });
      expect(afterSpy).toHaveBeenCalledTimes(1);
      expect(persistSpy).not.toHaveBeenCalled();

      await (afterSpy.mock.calls[0][0] as () => Promise<void>)();
      expect(persistSpy).toHaveBeenCalledWith({
        userId: "user-abc",
        sessionId: SESSION_ID,
        messageId: "msg-user-1",
        thumbnailBase64: JPEG,
      });
    });

    it("the upload closure carries the id returned by the insert for this request", async () => {
      appendMessagesSpy.mockResolvedValueOnce({ userMessageId: "msg-this-turn", assistantMessageId: "msg-a" });

      await post({ conditions: "", image: validImage() });
      await (afterSpy.mock.calls[0][0] as () => Promise<void>)();

      expect(persistSpy).toHaveBeenCalledTimes(1);
      const args = persistSpy.mock.calls[0] as unknown as [Record<string, unknown>];
      expect(args[0].messageId).toBe("msg-this-turn");
      expect(args[0]).not.toHaveProperty("text");
    });

    it("text requests save no thumbnailPath and schedule nothing", async () => {
      await post({ conditions: "overcast portrait" });

      expect(appendMessagesSpy.mock.calls[0][1]).toEqual({ text: "overcast portrait" });
      expect(afterSpy).not.toHaveBeenCalled();
    });

    it("empty conditions without an image is still invalid_input", async () => {
      const res = await post({ conditions: "" });

      expect(await res.json()).toMatchObject({ status: "invalid_input" });
      expect(getSettingsSpy).not.toHaveBeenCalled();
    });
  });

  describe("validation → 400 before rate limit, quota or classifier", () => {
    const oversized = "A".repeat(MAX_OUTPUT_BASE64_BYTES + 4);

    it.each([
      ["image not an object", { image: "nope" }],
      ["jpegBase64 missing", { image: validImage({ jpegBase64: undefined }) }],
      ["jpegBase64 over 3MB", { image: validImage({ jpegBase64: oversized }) }],
      ["jpegBase64 not base64", { image: validImage({ jpegBase64: "not base64!!" }) }],
      ["jpegBase64 bad padding", { image: validImage({ jpegBase64: JPEG.slice(0, -1) }) }],
      ["jpegBase64 is a PNG", { image: validImage({ jpegBase64: PNG }) }],
      ["thumbnail missing", { image: validImage({ thumbnailBase64: undefined }) }],
      ["thumbnail oversized", { image: validImage({ thumbnailBase64: "A".repeat(256 * 1024 + 4) }) }],
      ["thumbnail not base64", { image: validImage({ thumbnailBase64: "%%%%" }) }],
      ["thumbnail is a PNG", { image: validImage({ thumbnailBase64: PNG }) }],
      ["exif iso zero", { image: validImage({ exif: { fNumber: 2.8, exposureTimeS: 0.01, iso: 0, exposureBiasEv: 0 } }) }],
      ["exif bias non-numeric", { image: validImage({ exif: { fNumber: 2.8, exposureTimeS: 0.01, iso: 100, exposureBiasEv: "0" } }) }],
      ["hdrSuspect missing", { image: validImage({ rawExifFlags: {} }) }],
      ["histogram over 100", { image: validImage({ histogram: { shadowClipPct: 101, highlightClipPct: 0 } }) }],
      ["unknown condition", { condition: "sunny" }],
      ["unknown intent", { intent: "dramatic" }],
    ])("%s", async (_label, extra) => {
      const res = await post({ conditions: "portrait", ...extra });

      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ error: "validation" });
      expect(limitSpy).not.toHaveBeenCalled();
      expect(getSettingsSpy).not.toHaveBeenCalled();
      expect(rpcSpy).not.toHaveBeenCalled();
      expect(appendMessagesSpy).not.toHaveBeenCalled();
    });

    it("a thumbnail is validated even though it never reaches the classifier", async () => {
      const res = await post({ conditions: "", image: validImage({ thumbnailBase64: PNG }) });

      expect(res.status).toBe(400);
      expect((await res.json()).message).toContain("thumbnailBase64");
    });
  });

  describe("condition sent as an empty string", () => {
    it('condition: "" with an image → treated as absent, not a 400', async () => {
      const res = await post({ conditions: "", condition: "", intent: "natural", image: validImage() });

      expect(res.status).toBe(200);
      expect(getSettingsSpy).toHaveBeenCalledTimes(1);
      expect(getSettingsSpy.mock.calls[0][3]).toMatchObject({ condition: null });
      expect(rpcSpy.mock.calls[0][1]).toMatchObject({ p_units: 2 });
    });

    it('condition: "" with no image → treated as absent, not a 400', async () => {
      const res = await post({ conditions: "overcast portrait", condition: "" });

      expect(res.status).toBe(200);
      expect(getSettingsSpy.mock.calls[0][3]).toMatchObject({ condition: null });
    });
  });

  describe("gear profile unavailable", () => {
    it("getGearProfile throws → 503 gear_profile_unavailable, no classifier, no charge, no legacy fallback", async () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      getGearProfileSpy.mockRejectedValueOnce(new Error("connection reset"));

      const res = await post({ conditions: "portrait", image: validImage() });

      expect(res.status).toBe(503);
      expect(await res.json()).toEqual({ error: "gear_profile_unavailable" });
      expect(getSettingsSpy).not.toHaveBeenCalled();
      expect(rpcSpy).not.toHaveBeenCalled();
      expect(appendMessagesSpy).not.toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalledTimes(1);
      errorSpy.mockRestore();
    });

    it("no profile at all (null) is not an error → answered", async () => {
      getGearProfileSpy.mockResolvedValueOnce(null);

      const res = await post({ conditions: "overcast portrait" });

      expect(res.status).toBe(200);
      expect(getSettingsSpy.mock.calls[0][1]).toBeNull();
    });
  });

  describe("clarification cap", () => {
    it("clarification_required sets sessions.clarification_used, charges nothing, returns session_id", async () => {
      getSettingsSpy.mockResolvedValue({ status: "clarification_required", question: "What's the light like?" });

      const res = await post({ conditions: "help", session_id: SESSION_ID });

      expect(await res.json()).toEqual({
        status: "clarification_required",
        question: "What's the light like?",
        session_id: SESSION_ID,
      });
      expect(sessionUpdateSpy).toHaveBeenCalledWith({ clarification_used: true });
      expect(rpcSpy).not.toHaveBeenCalled();
      expect(appendMessagesSpy).toHaveBeenCalledTimes(1);
    });

    it("the session's clarification_used flag is passed to getSettings", async () => {
      state.clarificationUsed = true;

      await post({ conditions: "help", session_id: SESSION_ID });

      expect(getSettingsSpy.mock.calls[0][3]).toMatchObject({ clarificationUsed: true });
    });

    it("no session_id → clarificationUsed false (nothing to have been asked in)", async () => {
      state.clarificationUsed = true;

      await post({ conditions: "help" });

      expect(getSettingsSpy.mock.calls[0][3]).toMatchObject({ clarificationUsed: false });
    });
  });
});
