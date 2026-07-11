import { vi, describe, it, expect, beforeEach } from "vitest";

const { mockCreate } = vi.hoisted(() => ({ mockCreate: vi.fn() }));

// Spread the real module so named exports (APIError and its subclasses) stay
// the actual SDK classes — orchestrate.ts does `err instanceof APIError`, so
// tests must throw real instances, not a stand-in. Only the default client
// constructor is overridden, to route messages.create through mockCreate.
vi.mock("@anthropic-ai/sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@anthropic-ai/sdk")>();
  return {
    ...actual,
    default: vi.fn(() => ({
      messages: { create: mockCreate },
    })),
  };
});

import { APIError } from "@anthropic-ai/sdk";
import { getSettings } from "../orchestrate";

function apiResponse(text: string) {
  return { content: [{ type: "text", text }] };
}

describe("getSettings", () => {
  beforeEach(() => {
    mockCreate.mockReset();
  });

  it("1: ok scene → calculator output (iso=100, f/5.6, 1/1000)", async () => {
    mockCreate.mockResolvedValue(
      apiResponse(
        JSON.stringify({
          status: "ok",
          scene_ev: 15,
          motion_tier: "stationary",
          support: "handheld",
          focal_length_mm: 85,
          focal_length_assumed: false,
          creative_intent: "standard",
          white_balance: "daylight",
        })
      )
    );

    const result = await getSettings(
      "Outdoor portrait sunny afternoon 85mm handheld stationary"
    );

    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.iso).toBe(100);
      expect(result.aperture).toBe("f/5.6");
      expect(result.shutter_speed).toBe("1/1000");
    }
  });

  it("2: clarification_required → passed through", async () => {
    mockCreate.mockResolvedValue(
      apiResponse(
        JSON.stringify({
          status: "clarification_required",
          question: "What kind of subject or lighting are you working with?",
        })
      )
    );

    const result = await getSettings("help me take a photo");

    expect(result.status).toBe("clarification_required");
    if (result.status === "clarification_required") {
      expect(result.question).toBe(
        "What kind of subject or lighting are you working with?"
      );
    }
  });

  it("3: invalid_input → passed through", async () => {
    mockCreate.mockResolvedValue(
      apiResponse(
        JSON.stringify({
          status: "invalid_input",
          message:
            "Please describe your shooting conditions: lighting, subject, and movement.",
        })
      )
    );

    const result = await getSettings("purple banana submarine");

    expect(result.status).toBe("invalid_input");
    if (result.status === "invalid_input") {
      expect(result.message).toBe(
        "Please describe your shooting conditions: lighting, subject, and movement."
      );
    }
  });

  it("4: API throws network error → status=error", async () => {
    mockCreate.mockRejectedValue(new Error("fetch failed"));

    const result = await getSettings("sunny day portrait");

    expect(result.status).toBe("error");
  });

  it("5: classifier returns malformed JSON → status=error", async () => {
    mockCreate.mockResolvedValue(apiResponse("not valid json {{{"));

    const result = await getSettings("sunny day portrait");

    expect(result.status).toBe("error");
  });

  it("6: classifier returns {status:'ok'} missing required fields → status=error", async () => {
    mockCreate.mockResolvedValue(
      apiResponse(JSON.stringify({ status: "ok" }))
    );

    const result = await getSettings("sunny day portrait");

    expect(result.status).toBe("error");
  });

  // ─── service_busy gate — 429/503/529 only, nothing broader ─────────────────
  describe("Anthropic overload/rate-limit → status=service_busy (429/503/529 only)", () => {
    it("7: APIError status=529 (overloaded_error) → service_busy", async () => {
      mockCreate.mockRejectedValue(
        new APIError(529, { type: "overloaded_error" }, "Overloaded", new Headers())
      );

      const result = await getSettings("sunny day portrait");

      expect(result.status).toBe("service_busy");
    });

    it("8: APIError status=429 (rate_limit_error) → service_busy", async () => {
      mockCreate.mockRejectedValue(
        new APIError(429, { type: "rate_limit_error" }, "Rate limited", new Headers())
      );

      const result = await getSettings("sunny day portrait");

      expect(result.status).toBe("service_busy");
    });

    it("9: APIError status=503 → service_busy", async () => {
      mockCreate.mockRejectedValue(
        new APIError(503, { type: "api_error" }, "Service unavailable", new Headers())
      );

      const result = await getSettings("sunny day portrait");

      expect(result.status).toBe("service_busy");
    });

    it("10: APIError status=500 (plain internal error) → stays status=error, NOT service_busy", async () => {
      mockCreate.mockRejectedValue(
        new APIError(500, { type: "api_error" }, "Internal error", new Headers())
      );

      const result = await getSettings("sunny day portrait");

      expect(result.status).toBe("error");
    });

    it("11: non-APIError rejection (network error, existing test 4's shape) still stays status=error", async () => {
      mockCreate.mockRejectedValue(new Error("fetch failed"));

      const result = await getSettings("sunny day portrait");

      expect(result.status).toBe("error");
    });
  });
});
