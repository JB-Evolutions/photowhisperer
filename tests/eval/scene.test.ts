// The pure parts of mode 2: response validation, the offline stub, the
// recommendation scorer, cache keying and CLI parsing. The network call and
// the model itself are deliberately absent — mode 2 never runs in this suite.
import { describe, expect, it } from "vitest";

import { INDOOR_CONDITIONS } from "@/lib/exposure/ev";

import {
  CACHE_DIR,
  DEFAULT_MANIFEST,
  GEAR_FIXTURES,
  HEADLINE_FIXTURE_ID,
  OUT_DIR,
  cacheKey,
  modelId,
  parseArgs,
  parseScene,
  scoreRecommendations,
  stubClassifierResponse,
  timestampSlug,
  type EvalScene,
} from "../../scripts/eval-exposure";
import { loadFixtureManifest } from "./manifestPath";

const entries = loadFixtureManifest();
const byId = (id: string) => {
  const found = entries.find((e) => e.id === id);
  if (!found) throw new Error(`fixture manifest has no entry ${id}`);
  return found;
};

const okResponse = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    status: "ok",
    motion: "walking",
    support: "handheld",
    focal_length_mm: 35,
    subject_exposure_verdict: "subject_much_darker",
    condition: "night_street",
    ...over,
  });

const sceneOf = (raw: string): EvalScene => {
  const parsed = parseScene(raw);
  if (!("scene" in parsed)) throw new Error(`expected a scene, got ${parsed.error}`);
  return parsed.scene;
};

describe("parseScene", () => {
  it("reads the fields the harness actually uses", () => {
    expect(sceneOf(okResponse())).toEqual({
      motion: "walking",
      support: "handheld",
      focalMm: 35,
      verdict: "subject_much_darker",
      condition: "night_street",
    });
  });

  it("accepts a null condition as the indoor-ambient answer, not a failure", () => {
    expect(sceneOf(okResponse({ condition: null })).condition).toBeNull();
  });

  it("accepts a null focal length and a null verdict", () => {
    const scene = sceneOf(okResponse({ focal_length_mm: null, subject_exposure_verdict: null }));
    expect(scene.focalMm).toBeNull();
    expect(scene.verdict).toBeNull();
  });

  it("excludes rather than throws on unparseable output", () => {
    const parsed = parseScene("not json at all");
    expect(parsed).toMatchObject({ error: "MODEL_INVALID_JSON" });
  });

  it("distinguishes the model's own invalid_input from a malformed response", () => {
    const rejected = parseScene(JSON.stringify({ status: "invalid_input", message: "no photo" }));
    expect(rejected).toMatchObject({ error: "MODEL_INVALID_INPUT", detail: "no photo" });

    const malformed = parseScene(JSON.stringify({ status: "weird" }));
    expect(malformed).toMatchObject({ error: "MODEL_INVALID_SCENE" });
  });

  // Every one of these could otherwise be coerced into a plausible default,
  // and a default here quietly flatters the score instead of excluding the
  // entry with a reason.
  it.each([
    ["motion", { motion: "teleporting" }],
    ["support", { support: "monopod" }],
    ["focal length", { focal_length_mm: -5 }],
    ["verdict", { subject_exposure_verdict: "looks_fine" }],
    ["condition", { condition: "golden_hour_ish" }],
  ])("refuses an out-of-contract %s", (_label, patch) => {
    const parsed = parseScene(okResponse(patch));
    expect(parsed).toMatchObject({ error: "MODEL_INVALID_SCENE" });
    expect("scene" in parsed).toBe(false);
  });

  it("refuses a JSON array or a bare value", () => {
    expect(parseScene("[]")).toMatchObject({ error: "MODEL_INVALID_SCENE" });
    expect(parseScene("42")).toMatchObject({ error: "MODEL_INVALID_SCENE" });
  });
});

describe("stubClassifierResponse", () => {
  it("produces a response the harness's own parser accepts", () => {
    for (const entry of entries) {
      expect(() => sceneOf(stubClassifierResponse(entry))).not.toThrow();
    }
  });

  it("is deterministic", () => {
    const entry = byId("fx-daylight-direct-sun-park");
    expect(stubClassifierResponse(entry)).toBe(stubClassifierResponse(entry));
  });

  // The production prompt tells the model to return a null condition for an
  // indoor AMBIENT scene. The stub has to null it in exactly the same places,
  // or --stub-model measures a coverage story the real run does not have.
  it("nulls the condition exactly where the production prompt does", () => {
    for (const entry of entries) {
      const scene = sceneOf(stubClassifierResponse(entry));
      const ambientIndoor = INDOOR_CONDITIONS.has(entry.condition);
      expect(scene.condition, entry.id).toBe(ambientIndoor ? null : entry.condition);
    }
  });

  it("still names a subject light class used indoors", () => {
    // stage_lit is indoor but is a subject class, so tier 2 does cover it.
    const stage = byId("fx-stage-lit-theatre");
    expect(stage.indoor).toBe(true);
    expect(sceneOf(stubClassifierResponse(stage)).condition).toBe("stage_lit");
  });
});

describe("scoreRecommendations", () => {
  const scene: EvalScene = {
    motion: "static",
    support: "handheld",
    focalMm: 50,
    verdict: null,
    condition: "direct_sun",
  };

  it("scores every gear fixture", () => {
    const scores = scoreRecommendations(15, 15, scene);
    expect(Object.keys(scores).sort()).toEqual(GEAR_FIXTURES.map((f) => f.id).sort());
    expect(scores[HEADLINE_FIXTURE_ID]).toBeCloseTo(0, 6);
  });

  it("is zero everywhere when the estimate is right and there is light to spare", () => {
    for (const value of Object.values(scoreRecommendations(14, 14, scene))) {
      expect(value).toBeCloseTo(0, 6);
    }
  });

  // recAbsError is scored against GROUND TRUTH, so an EV the model got wrong
  // shows up as a recommendation that misses by the same amount. That is the
  // secondary metric doing its job — it never gates.
  it("charges a wrong EV estimate to the recommendation", () => {
    // Two stops of EV error, less whatever camera-step rounding the triple
    // already declares — so most of the two stops, not all of it.
    const scores = scoreRecommendations(12, 14, scene);
    expect(scores[HEADLINE_FIXTURE_ID]).toBeGreaterThan(1);
    expect(scores[HEADLINE_FIXTURE_ID]).toBeLessThanOrEqual(2);
  });

  it("forgives a night scene the ISO ceiling deliberately leaves short", () => {
    const night: EvalScene = { ...scene, condition: "night_moonlit" };
    const ev = byId("fx-night-moonlit-field").groundTruth.ev100;
    for (const value of Object.values(scoreRecommendations(ev, ev, night))) {
      expect(value).toBeCloseTo(0, 6);
    }
  });
});

describe("cache keying", () => {
  const sha = "a".repeat(64);

  it("writes under .corpus-cache and keys on the image and the prompt", () => {
    expect(CACHE_DIR).toBe(".corpus-cache");
    const key = cacheKey(sha, "prompt", "user", modelId());
    expect(key.imageSha).toBe(sha);
    expect(key.promptSha).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is stable for the same inputs", () => {
    expect(cacheKey(sha, "p", "u", "m")).toEqual(cacheKey(sha, "p", "u", "m"));
  });

  it.each([
    ["prompt", ["p2", "u", "m"]],
    ["user text", ["p", "u2", "m"]],
    ["model", ["p", "u", "m2"]],
  ])("moves when the %s moves", (_label, [prompt, user, model]) => {
    expect(cacheKey(sha, prompt, user, model).promptSha).not.toBe(
      cacheKey(sha, "p", "u", "m").promptSha
    );
  });

  // Concatenating the parts without a separator would let a prompt ending in
  // "x" and a user text starting with "y" collide with the reverse split.
  it("does not collide across the boundary between its parts", () => {
    expect(cacheKey(sha, "ab", "c", "m").promptSha).not.toBe(
      cacheKey(sha, "a", "bc", "m").promptSha
    );
  });
});

describe("parseArgs", () => {
  it("defaults to the model run against the corpus manifest, with the cache on", () => {
    expect(parseArgs([])).toEqual({
      ladder: false,
      manifestPath: DEFAULT_MANIFEST,
      outDir: OUT_DIR,
      useCache: true,
      stub: false,
      useNotes: false,
      limit: null,
    });
  });

  it("reads the documented flags", () => {
    const options = parseArgs([
      "--ladder",
      "--no-cache",
      "--stub-model",
      "--use-notes",
      "--manifest",
      "tests/eval/fixtures/manifest.json",
      "--out",
      "tmp-out",
      "--limit",
      "4",
    ]);
    expect(options).toEqual({
      ladder: true,
      manifestPath: "tests/eval/fixtures/manifest.json",
      outDir: "tmp-out",
      useCache: false,
      stub: true,
      useNotes: true,
      limit: 4,
    });
  });

  it("rejects an unknown flag rather than ignoring it", () => {
    expect(() => parseArgs(["--ladders"])).toThrow(/Unknown argument/);
  });

  it("rejects a nonsense limit", () => {
    expect(() => parseArgs(["--limit", "0"])).toThrow(/positive integer/);
    expect(() => parseArgs(["--limit", "two"])).toThrow(/positive integer/);
  });
});

describe("report paths", () => {
  it("writes under eval-out with a filesystem-safe timestamp", () => {
    expect(OUT_DIR).toBe("eval-out");
    const slug = timestampSlug(new Date("2026-09-16T11:22:33.444Z"));
    expect(slug).toBe("2026-09-16T11-22-33-444Z");
    expect(slug).not.toMatch(/[:]/);
  });
});
