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

// Pass-through spy: the real solver runs, and tests can read the sceneEv it
// was handed.
vi.mock("../../calculator/ladder", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../calculator/ladder")>();
  return { ...actual, solveExposure: vi.fn(actual.solveExposure) };
});

import { APIError } from "@anthropic-ai/sdk";
import { solveExposure } from "../../calculator/ladder";
import { DEFAULT_ISO_CEILING, LIGHT_CONDITION_EV } from "../../lib/contract/types";
import {
  getSettings,
  inferConditionFromText,
  CLARIFICATION_QUESTION,
  HIGHLIGHT_WARNING,
  WIDEST_APERTURE_LABEL,
} from "../orchestrate";
import type { GearProfile, ImageInput } from "../types";
import { HDR_ASSUMPTION, SCENE_CLASS_ASSUMPTION } from "../../lib/exposure/ev";
import { parseLensString } from "../../lib/lens/parse";
import {
  CAMERA_APERTURE_STEPS,
  CAMERA_ISO_STEPS,
  CAMERA_SHUTTER_STEPS_S,
} from "../../calculator/constants";
import { formatAperture, formatShutter } from "../../calculator/format";
import type { BodyProfile } from "../../lib/contract/types";

function apiResponse(text: string) {
  return { content: [{ type: "text", text }] };
}

// Minimal valid ok classification; spread overrides per test.
function okScene(overrides: Record<string, unknown> = {}) {
  return apiResponse(
    JSON.stringify({
      status: "ok",
      motion: "static",
      support: "handheld",
      focal_length_mm: null,
      white_balance: "daylight",
      lighting_direction: "front",
      highlight_risk: false,
      defaulted: [],
      scene_summary: "A portrait.",
      ...overrides,
    })
  );
}

function image(overrides: Partial<ImageInput> = {}): ImageInput {
  return {
    jpegBase64: "/9j/4AAQ",
    exif: null,
    rawExifFlags: { hdrSuspect: false },
    histogram: { shadowClipPct: 0, highlightClipPct: 0 },
    ...overrides,
  };
}

const AUTO_BODY: BodyProfile = {
  label: "Test body",
  cropFactor: 1,
  ibisStops: null,
  isoBase: 100,
  isoMode: "auto",
  isoValue: null,
  isoMax: null,
};

describe("getSettings", () => {
  beforeEach(() => {
    mockCreate.mockReset();
  });

  it("1: ok scene, no profile → unknown lens renders 'widest your lens allows', rounded 1/2500 at ISO 100", async () => {
    mockCreate.mockResolvedValue(okScene());

    const result = await getSettings("Outdoor portrait, sunny");

    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.aperture).toBe(WIDEST_APERTURE_LABEL);
      expect(result.aperture).toBe("widest your lens allows");
      // Solver's exact 1/2048 is snapped faster to the camera step.
      expect(result.shutter_speed).toBe("1/2500");
      expect(result.iso).toBe(100);
      expect(result.color_temperature).toBe("5500K");
      expect(result.floorExplain.length).toBeGreaterThan(0);
      expect(result.shortfallStops).toBe(0);
      expect(result.assumptions).toContain('Light read as direct sun from "sunny".');
    }
  });

  it("2: no light token and no clarification used → tier-3 clarification_required", async () => {
    mockCreate.mockResolvedValue(okScene());

    const result = await getSettings("help me take a photo");

    expect(result).toEqual({ status: "clarification_required", question: CLARIFICATION_QUESTION });
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

  // ─── Clarification cap ─────────────────────────────────────────────────────
  describe("clarification cap (one per session)", () => {
    it("second ambiguous input after the cap → full answer with a stated assumption", async () => {
      mockCreate.mockResolvedValue(okScene());

      const first = await getSettings("help me take a photo", null, null, { clarificationUsed: false });
      expect(first.status).toBe("clarification_required");

      const second = await getSettings("help me take a photo", null, null, { clarificationUsed: true });
      expect(second.status).toBe("ok");
      if (second.status === "ok") {
        expect(second.assumptions.some((a) => a.startsWith("No light level given, so assumed"))).toBe(true);
      }
    });

    it.each([
      ["empty string", ""],
      ["bare emoji", "🤷"],
      ["free text", "idk just make it look nice"],
    ])("capped %s → ok, never a second question", async (_label, text) => {
      mockCreate.mockResolvedValue(okScene());

      const result = await getSettings(text, null, null, { clarificationUsed: true });

      expect(result.status).toBe("ok");
      if (result.status === "ok") {
        expect(result.assumptions.filter((a) => a.startsWith("No light level given"))).toHaveLength(1);
      }
    });

    it("capped ambiguous indoor text maps to indoor artificial light", async () => {
      mockCreate.mockResolvedValue(okScene());

      const result = await getSettings("my kid in the kitchen", null, null, { clarificationUsed: true });

      expect(result.status).toBe("ok");
      if (result.status === "ok") {
        expect(result.assumptions).toContain(
          "No light level given, so assumed indoor artificial light — pick a light condition for exact settings."
        );
      }
    });

    it("a light emoji is a token: inferred silently, no question even before the cap", async () => {
      mockCreate.mockResolvedValue(okScene());

      const result = await getSettings("☀️", null, null, { clarificationUsed: false });

      expect(result.status).toBe("ok");
      if (result.status === "ok") {
        expect(result.assumptions.some((a) => a.startsWith("Light read as direct sun"))).toBe(true);
      }
    });

    it("a legacy model clarification_required is not passed through — the orchestrator owns the question", async () => {
      mockCreate.mockResolvedValue(
        apiResponse(JSON.stringify({ status: "clarification_required", question: "What subject?" }))
      );

      const noToken = await getSettings("help");
      expect(noToken).toEqual({ status: "clarification_required", question: CLARIFICATION_QUESTION });

      const withToken = await getSettings("overcast afternoon");
      expect(withToken.status).toBe("ok");
    });

    it("text requests never take light from the model's condition field", async () => {
      mockCreate.mockResolvedValue(okScene({ condition: "direct_sun" }));

      const result = await getSettings("a portrait");

      expect(result.status).toBe("clarification_required");
    });
  });

  // ─── Validation ────────────────────────────────────────────────────────────
  describe("classifier field validation", () => {
    it.each([
      ["subject_exposure_verdict", "very_dark"],
      ["subject_exposure_verdict", 2],
      ["condition", "bright"],
      ["condition", 13],
      ["focal_length_mm", 12.5],
      ["focal_length_mm", "85"],
      ["lighting_direction", "left"],
      ["highlight_risk", "yes"],
      ["defaulted", "motion"],
    ])("malformed %s=%j → status=error", async (field, value) => {
      mockCreate.mockResolvedValue(okScene({ [field]: value }));

      const result = await getSettings("sunny portrait", null, null, { image: image() });

      expect(result).toEqual({ status: "error", message: "Received an invalid scene classification." });
    });

    it("verdict and condition absent or null → tolerated", async () => {
      mockCreate.mockResolvedValueOnce(okScene());
      mockCreate.mockResolvedValueOnce(okScene({ subject_exposure_verdict: null, condition: null }));

      expect((await getSettings("sunny portrait", null, null, { image: image() })).status).toBe("ok");
      expect((await getSettings("sunny portrait", null, null, { image: image() })).status).toBe("ok");
    });

    it("valid verdict and condition values → accepted", async () => {
      mockCreate.mockResolvedValue(
        okScene({ subject_exposure_verdict: "subject_much_darker", condition: "open_shade" })
      );

      const result = await getSettings("portrait", null, null, { image: image() });

      expect(result.status).toBe("ok");
    });
  });

  // ─── Image path ────────────────────────────────────────────────────────────
  describe("image path", () => {
    it("sends the image block before the text, with max_tokens 700", async () => {
      mockCreate.mockResolvedValue(okScene());

      await getSettings("", null, null, {
        image: image({ exif: { fNumber: 8, exposureTimeS: 1 / 250, iso: 100, exposureBiasEv: 0 } }),
      });

      const params = mockCreate.mock.calls[0][0];
      expect(params.max_tokens).toBe(700);
      const content = params.messages[0].content;
      expect(content[0].type).toBe("image");
      expect(content[0].source).toEqual({ type: "base64", media_type: "image/jpeg", data: "/9j/4AAQ" });
      expect(content[1]).toEqual({ type: "text", text: "(no description provided)" });
      expect(params.system).toContain("Use the supplied EV 14");
      expect(params.system).not.toContain('Add "condition"');
    });

    it("tier 1: EXIF EV is used, no clarification even with no text", async () => {
      // f/8, 1/250, ISO 100 → EV 13.97, used as measured (not snapped to hazy sun, EV 14).
      mockCreate.mockResolvedValue(okScene({ subject_exposure_verdict: "metered_on_subject" }));

      const result = await getSettings("", null, null, {
        image: image({ exif: { fNumber: 8, exposureTimeS: 1 / 250, iso: 100, exposureBiasEv: 0 } }),
      });

      expect(result.status).toBe("ok");
      if (result.status === "ok") {
        // Same exposure as the photo at the notional f/4: 2 stops wider → 1/1000.
        // Snapping to EV 14 gave 1/1024 → 1/1250.
        expect(result.shutter_speed).toBe("1/1000");
        expect(result.assumptions.some((a) => a.startsWith("Measured light"))).toBe(false);
      }
    });

    it("tier 1: HDR-suspect EXIF appends the resolver's assumption", async () => {
      mockCreate.mockResolvedValue(okScene());

      const result = await getSettings("", null, null, {
        image: image({
          exif: { fNumber: 8, exposureTimeS: 1 / 250, iso: 100, exposureBiasEv: 0 },
          rawExifFlags: { hdrSuspect: true },
        }),
      });

      expect(result.status === "ok" && result.assumptions.includes(HDR_ASSUMPTION)).toBe(true);
    });

    it("tier 2: no EXIF, model condition outdoors → scene-class assumption", async () => {
      mockCreate.mockResolvedValue(okScene({ condition: "overcast" }));

      const result = await getSettings("", null, null, { image: image() });

      expect(result.status).toBe("ok");
      if (result.status === "ok") {
        expect(result.assumptions).toContain(SCENE_CLASS_ASSUMPTION);
      }
      expect(mockCreate.mock.calls[0][0].system).toContain('Add "condition"');
    });

    it("no EXIF and no model condition falls to tier 3 → clarification", async () => {
      mockCreate.mockResolvedValue(okScene({ condition: null }));

      const result = await getSettings("", null, null, { image: image() });

      expect(result.status).toBe("clarification_required");
    });
  });

  // ─── Scene EV reaches the solver unbucketed ────────────────────────────────
  describe("scene EV is passed to the solver as a number", () => {
    const solveSpy = vi.mocked(solveExposure);
    const gear: GearProfile = {
      body: AUTO_BODY,
      lenses: [
        {
          label: "50mm f/1.8",
          focalMinMm: 50,
          focalMaxMm: 50,
          aperWide: 1.8,
          aperTele: 1.8,
          stabilised: false,
          stabStops: null,
          confidence: "high",
        },
      ],
    };
    // EV = log2(N² / t) − log2(ISO / 100).
    const EXIF_EV_1_5 = { fNumber: 2, exposureTimeS: Math.SQRT2, iso: 100, exposureBiasEv: 0 };
    const EXIF_EV_4 = { fNumber: 4, exposureTimeS: 1, iso: 100, exposureBiasEv: 0 };
    const EXIF_EV_9_3 = { fNumber: 4, exposureTimeS: 16 / 2 ** 9.3, iso: 100, exposureBiasEv: 0 };

    beforeEach(() => {
      solveSpy.mockClear();
      mockCreate.mockResolvedValue(okScene({ focal_length_mm: 50 }));
    });

    it("photo with measured EV 1.5 → not the night_no_street (EV 4) result", async () => {
      const photo = await getSettings("", gear, null, { image: image({ exif: EXIF_EV_1_5 }) });
      const text = await getSettings("a portrait", gear, null, { condition: "night_no_street" });

      expect(solveSpy.mock.calls[0][0].sceneEv).toBeCloseTo(1.5, 9);
      expect(photo.status).toBe("ok");
      expect(text.status).toBe("ok");
      expect(photo).not.toEqual(text);
      if (photo.status === "ok" && text.status === "ok") {
        // 2.5 stops darker at the same shutter floor → more ISO.
        expect(photo.shutter_speed).toBe(text.shutter_speed);
        expect(photo.iso).toBeGreaterThan(text.iso);
        expect(photo.assumptions.some((a) => a.includes("nearest light level"))).toBe(false);
      }
    });

    it("exposure compensation keeps its sign: settings EV 2.5 with −1 bias is scene EV 1.5", async () => {
      const unbiased = await getSettings("", gear, null, { image: image({ exif: EXIF_EV_1_5 }) });
      const biased = await getSettings("", gear, null, {
        image: image({ exif: { fNumber: 2, exposureTimeS: Math.SQRT1_2, iso: 100, exposureBiasEv: -1 } }),
      });

      expect(solveSpy.mock.calls[1][0].sceneEv).toBeCloseTo(1.5, 9);
      expect(biased).toEqual(unbiased);
    });

    it("text request with condition night_no_street → solver gets exactly EV 4, same result as a measured EV 4", async () => {
      const text = await getSettings("a portrait", gear, null, { condition: "night_no_street" });
      const photo = await getSettings("", gear, null, { image: image({ exif: EXIF_EV_4 }) });

      expect(solveSpy.mock.calls[0][0].sceneEv).toBe(LIGHT_CONDITION_EV.night_no_street);
      expect(solveSpy.mock.calls[0][0].sceneEv).toBe(4);
      expect(solveSpy.mock.calls[1][0].sceneEv).toBe(4);
      expect(text.status).toBe("ok");
      expect(text).toEqual(photo);
    });

    it("fractional measured EV 9.3 → passed as 9.3, not rounded to a condition's EV", async () => {
      const result = await getSettings("", gear, null, { image: image({ exif: EXIF_EV_9_3 }) });

      const sceneEv = solveSpy.mock.calls[0][0].sceneEv;
      expect(sceneEv).toBeCloseTo(9.3, 9);
      expect(Object.values(LIGHT_CONDITION_EV)).not.toContain(sceneEv);
      expect(result.status).toBe("ok");
    });

    it("condition moon_subject → solver gets exactly EV 15", async () => {
      await getSettings("the moon", gear, null, { condition: "moon_subject" });

      expect(solveSpy.mock.calls[0][0].sceneEv).toBe(LIGHT_CONDITION_EV.moon_subject);
      expect(solveSpy.mock.calls[0][0].sceneEv).toBe(15);
    });

    it("condition night_moonlit is unchanged at EV −2", async () => {
      await getSettings("a moonlit field", gear, null, { condition: "night_moonlit" });

      expect(solveSpy.mock.calls[0][0].sceneEv).toBe(LIGHT_CONDITION_EV.night_moonlit);
      expect(solveSpy.mock.calls[0][0].sceneEv).toBe(-2);
    });

    it("a measured EV bypasses the table even when a condition is also stated", async () => {
      await getSettings("the moon", gear, null, {
        image: image({ exif: EXIF_EV_9_3 }),
        condition: "moon_subject",
      });

      const sceneEv = solveSpy.mock.calls[0][0].sceneEv;
      expect(sceneEv).toBeCloseTo(9.3, 9);
      expect(sceneEv).not.toBe(LIGHT_CONDITION_EV.moon_subject);
    });
  });

  // ─── Structured scene input ────────────────────────────────────────────────
  describe("condition and intent from the request body", () => {
    it("body condition goes straight to the solver, with no light assumption or question", async () => {
      mockCreate.mockResolvedValue(okScene());

      const result = await getSettings("a portrait", null, null, { condition: "open_shade" });

      expect(result.status).toBe("ok");
      if (result.status === "ok") {
        // EV 12 at the notional f/4: 1/256 → 1/320.
        expect(result.shutter_speed).toBe("1/320");
        expect(result.assumptions.some((a) => a.startsWith("Light read as"))).toBe(false);
      }
    });

    it("intent shifts the target: bright is two stops more exposure than moody", async () => {
      mockCreate.mockResolvedValue(okScene());

      const bright = await getSettings("a portrait", null, null, { condition: "open_shade", intent: "bright" });
      const moody = await getSettings("a portrait", null, null, { condition: "open_shade", intent: "moody" });

      expect(bright.status === "ok" && bright.shutter_speed).toBe("1/160");
      expect(moody.status === "ok" && moody.shutter_speed).toBe("1/640");
    });

    it("exposure_bias_stops from the model is ignored", async () => {
      mockCreate.mockResolvedValueOnce(okScene());
      mockCreate.mockResolvedValueOnce(okScene({ exposure_bias_stops: 3 }));

      const plain = await getSettings("a portrait", null, null, { condition: "open_shade" });
      const biased = await getSettings("a portrait", null, null, { condition: "open_shade" });

      expect(biased).toEqual(plain);
    });
  });

  // ─── Gear, rounding, shortfall ─────────────────────────────────────────────
  describe("gear, rounding and shortfall", () => {
    it("legacy CameraProfile 18-55 f/3.5-5.6 at a stated 55mm → f/5.6", async () => {
      mockCreate.mockResolvedValue(okScene({ focal_length_mm: 55 }));

      const result = await getSettings(
        "sunny portrait",
        { body: "Sony A6000", lenses: ["Sony 18-55 f/3.5-5.6"], flash: null, notes: null },
        null
      );

      expect(result.status === "ok" && result.aperture).toBe("f/5.6");
    });

    it("every emitted value sits on a camera step (mid-zoom aperture, shutter, ISO)", async () => {
      mockCreate.mockResolvedValue(okScene({ focal_length_mm: 35 }));
      const gear: GearProfile = { body: AUTO_BODY, lenses: [parseLensString("Sony 18-55 f/3.5-5.6")] };

      const result = await getSettings("indoor portrait by a lamp", gear);

      expect(result.status).toBe("ok");
      if (result.status === "ok") {
        expect(CAMERA_APERTURE_STEPS.map(formatAperture)).toContain(result.aperture);
        expect(CAMERA_SHUTTER_STEPS_S.map(formatShutter)).toContain(result.shutter_speed);
        expect(CAMERA_ISO_STEPS).toContain(result.iso);
      }
    });

    it("locked ISO shortfall states the stops and the cause", async () => {
      mockCreate.mockResolvedValue(okScene({ focal_length_mm: 50 }));
      const gear: GearProfile = {
        body: { ...AUTO_BODY, isoMode: "locked", isoValue: 400 },
        lenses: [
          {
            label: "50mm f/1.8",
            focalMinMm: 50,
            focalMaxMm: 50,
            aperWide: 1.8,
            aperTele: 1.8,
            stabilised: false,
            stabStops: null,
            confidence: "high",
          },
        ],
      };

      const result = await getSettings("dinner", gear, null, { condition: "candlelit" });

      expect(result.status).toBe("ok");
      if (result.status === "ok") {
        expect(result.iso).toBe(400);
        expect(result.aperture).toBe("f/1.8");
        expect(result.shortfallStops).toBeGreaterThan(1);
        const line = result.assumptions.find((a) => a.includes("underexposed"));
        expect(line).toMatch(
          /^Still \d+\.\d stops underexposed — limited by your locked ISO \(ISO 400\) and the lens aperture limit \(f\/1\.8\)/
        );
        expect(result.floorExplain.length).toBeGreaterThan(0);
      }
    });

    it("null crop factor and an uncovered focal length each add an assumption", async () => {
      mockCreate.mockResolvedValue(okScene({ focal_length_mm: 200 }));
      const gear: GearProfile = {
        body: { ...AUTO_BODY, cropFactor: null },
        lenses: [parseLensString("Sony 18-55 f/3.5-5.6")],
      };

      const result = await getSettings("sunny", gear);

      expect(result.status).toBe("ok");
      if (result.status === "ok") {
        expect(result.aperture).toBe(WIDEST_APERTURE_LABEL);
        expect(result.assumptions.some((a) => a.includes("None of your lenses is known to cover 200mm"))).toBe(true);
        expect(result.assumptions.some((a) => a.includes("crop factor not set"))).toBe(true);
      }
    });

    it("highlight_risk → warning", async () => {
      mockCreate.mockResolvedValue(okScene({ highlight_risk: true }));

      const result = await getSettings("night street with neon signs");

      expect(result.status === "ok" && result.warnings).toEqual([HIGHLIGHT_WARNING]);
    });
  });

  // ─── ISO ceiling ───────────────────────────────────────────────────────────
  describe("the ISO ceiling binds and says so", () => {
    const FIFTY_PRIME = {
      label: "50mm f/1.8",
      focalMinMm: 50,
      focalMaxMm: 50,
      aperWide: 1.8,
      aperTele: 1.8,
      stabilised: false,
      stabStops: null,
      confidence: "high" as const,
    };

    beforeEach(() => {
      mockCreate.mockResolvedValue(okScene({ focal_length_mm: 50 }));
    });

    it("an auto body in moonlight stops at ISO 6400 and names the ceiling that bound it", async () => {
      const gear: GearProfile = { body: AUTO_BODY, lenses: [FIFTY_PRIME] };

      const result = await getSettings("a field", gear, null, { condition: "night_moonlit" });

      expect(result.status).toBe("ok");
      if (result.status === "ok") {
        expect(result.iso).toBe(DEFAULT_ISO_CEILING);
        expect(result.shortfallStops).toBeGreaterThan(0);
        const line = result.assumptions.find((a) => a.includes("underexposed"));
        expect(line).toMatch(
          /^Still \d+\.\d stops underexposed — limited by the ISO ceiling \(ISO 6400\) and the lens aperture limit \(f\/1\.8\), with the shutter at its .+ floor\.$/
        );
      }
    });

    it("a capped body at 3000 still returns 3000", async () => {
      const gear: GearProfile = {
        body: { ...AUTO_BODY, isoMode: "capped", isoMax: 3000 },
        lenses: [FIFTY_PRIME],
      };

      const result = await getSettings("a field", gear, null, { condition: "night_moonlit" });

      expect(result.status === "ok" && result.iso).toBe(3000);
    });

    it("a body declaring isoMax 12800 reaches 12800", async () => {
      const gear: GearProfile = {
        body: { ...AUTO_BODY, isoMode: "capped", isoMax: 12800 },
        lenses: [FIFTY_PRIME],
      };

      const result = await getSettings("a field", gear, null, { condition: "night_moonlit" });

      expect(result.status === "ok" && result.iso).toBe(12800);
    });

    it("a reachable scene keeps ISO under the ceiling and reports no shortfall", async () => {
      const gear: GearProfile = { body: AUTO_BODY, lenses: [FIFTY_PRIME] };

      const result = await getSettings("a room", gear, null, { condition: "night_no_street" });

      expect(result.status).toBe("ok");
      if (result.status === "ok") {
        expect(result.iso).toBeLessThan(DEFAULT_ISO_CEILING);
        expect(result.shortfallStops).toBe(0);
        expect(result.assumptions.some((a) => a.includes("underexposed"))).toBe(false);
      }
    });

    it("a base ISO above the ceiling is clamped, and the stops it costs are reported", async () => {
      // Rung 3 never runs — the scene is bright enough that the shutter stays
      // inside its floor — so the ladder reports no shortfall at ISO 12800.
      // The clamp to 6400 still costs a real stop, and it has to surface.
      const gear: GearProfile = {
        body: { ...AUTO_BODY, isoBase: 12800 },
        lenses: [FIFTY_PRIME],
      };

      const result = await getSettings("a room", gear, null, { condition: "indoor_dim" });

      expect(result.status).toBe("ok");
      if (result.status === "ok") {
        expect(result.iso).toBe(DEFAULT_ISO_CEILING);
        // At least the full stop the clamp took; the shutter's own rounding
        // loss rides along once a real limit has bound.
        expect(result.shortfallStops).toBeGreaterThanOrEqual(1);
        expect(result.assumptions.some((a) => a.includes("the ISO ceiling (ISO 6400)"))).toBe(true);
      }
    });

    it("moon_subject is a bright, reachable exposure where night_moonlit was not", async () => {
      const gear: GearProfile = { body: AUTO_BODY, lenses: [FIFTY_PRIME] };

      const moon = await getSettings("the moon", gear, null, { condition: "moon_subject" });
      const field = await getSettings("a field", gear, null, { condition: "night_moonlit" });

      expect(moon.status).toBe("ok");
      if (moon.status === "ok") {
        expect(moon.iso).toBe(100);
        expect(moon.shortfallStops).toBe(0);
        // Fractions of a second, not the seconds-long drag the ambient read gives.
        expect(moon.shutter_speed.startsWith("1/")).toBe(true);
      }
      expect(field.status === "ok" && field.iso).toBe(DEFAULT_ISO_CEILING);
      expect(field.status === "ok" && field.shortfallStops).toBeGreaterThan(0);
    });
  });
});

// ─── Text inference: the moon lights a scene or is the scene ─────────────────
describe("inferConditionFromText — moon as light source vs moon as subject", () => {
  it.each([
    ["shooting the moon", "moon_subject"],
    ["full moon close up", "moon_subject"],
    ["moonrise over the bay", "moon_subject"],
    ["a supermoon tonight", "moon_subject"],
    ["moonlit landscape", "night_moonlit"],
    ["a field under moonlight", "night_moonlit"],
    ["a barn lit by the moon", "night_moonlit"],
    ["walking under the moon", "night_moonlit"],
  ])("%s → %s", (text, condition) => {
    expect(inferConditionFromText(text)?.condition).toBe(condition);
  });

  it("the moonlit forms win the race: the bare-moon rule never swallows them", () => {
    // Both rules can see "moon"; only the ordering keeps these ambient.
    for (const text of ["moonlit", "moonlight", "moonlighting under the stars"]) {
      expect(inferConditionFromText(text)?.condition).toBe("night_moonlit");
    }
  });

  it("a moon emoji still marks night, not a lunar telephoto", () => {
    expect(inferConditionFromText("out for a walk 🌙")?.condition).toBe("night_moonlit");
  });

  it("the moon is the subject indoors too — a window does not dim it", () => {
    expect(inferConditionFromText("the moon from my bedroom window")?.condition).toBe("moon_subject");
    // But a room lit by it is still a dim room.
    expect(inferConditionFromText("a bedroom lit by the moon")?.condition).toBe("indoor_dim");
  });
});

describe("text inference reaches the solver", () => {
  beforeEach(() => {
    mockCreate.mockReset();
    mockCreate.mockResolvedValue(apiResponse(JSON.stringify({
      status: "ok", motion: "static", support: "tripod", focal_length_mm: 400,
      white_balance: "daylight", lighting_direction: "front", highlight_risk: false,
      defaulted: [], scene_summary: "The moon.",
    })));
  });

  it('"shooting the moon" is solved at EV 15, not the EV −2 of the ground below it', async () => {
    const solveSpy = vi.mocked(solveExposure);
    solveSpy.mockClear();

    const result = await getSettings("shooting the moon");

    expect(solveSpy.mock.calls[0][0].sceneEv).toBe(LIGHT_CONDITION_EV.moon_subject);
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.iso).toBe(100);
      expect(result.shortfallStops).toBe(0);
      expect(result.assumptions).toContain('Light read as the moon itself from "moon".');
    }
  });

  it('"a moonlit landscape" is still solved at EV −2', async () => {
    const solveSpy = vi.mocked(solveExposure);
    solveSpy.mockClear();

    const result = await getSettings("a moonlit landscape");

    expect(solveSpy.mock.calls[0][0].sceneEv).toBe(LIGHT_CONDITION_EV.night_moonlit);
    expect(result.status === "ok" && result.assumptions).toContain(
      'Light read as a moonlit night from "moonlit".'
    );
  });
});
