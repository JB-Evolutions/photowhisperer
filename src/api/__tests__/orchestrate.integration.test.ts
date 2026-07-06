// Pack 4 integration tests. Hits the real Anthropic API — skipped entirely
// when no key is configured so CI/local runs without ANTHROPIC_API_KEY don't
// fail or incur cost.
import { describe, it, expect } from "vitest";
import { getSettings } from "../orchestrate";
import type { CameraProfile, PriorContext } from "../types";

const hasApiKey = Boolean(process.env.ANTHROPIC_API_KEY);
const maybeDescribe = hasApiKey ? describe : describe.skip;

function parseApertureFNumber(aperture: string): number {
  const match = aperture.match(/^f\/([\d.]+)$/);
  if (!match) throw new Error(`Unparseable aperture: ${aperture}`);
  return Number(match[1]);
}

maybeDescribe("getSettings (Pack 4 integration, real API)", () => {
  it("T1: camera_profile constrains aperture to the user's widest lens", async () => {
    const camera_profile: CameraProfile = {
      body: "Sony A6000",
      lenses: ["Sony 18-55 f/3.5-5.6"],
      flash: "none",
      notes: null,
    };

    const result = await getSettings(
      "Sunny afternoon outdoors, bright direct sun, portrait of a friend standing still",
      camera_profile,
      null
    );

    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      const fNumber = parseApertureFNumber(result.aperture);
      // Widest the kit supports is f/3.5 — a smaller number (e.g. f/2.8) is
      // not executable on this lens and must fail this assertion.
      expect(fNumber).toBeGreaterThanOrEqual(3.5);
    }
  }, 30000);

  it("T2: prior_context produces a scene_summary consistent with the prior subject", async () => {
    const prior_context: PriorContext = {
      user_msg: "Photographing my dog running in the park at sunset",
      assistant_summary: "Dog running in the park during golden hour light.",
    };

    const result = await getSettings(
      "Now she's sitting still waiting for a treat, same lighting",
      null,
      prior_context
    );

    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.scene_summary).toBeTruthy();
      expect(result.scene_summary?.toLowerCase()).toMatch(/dog|park/);
    }
  }, 30000);

  it("T3: gibberish conditions → status='invalid_input'", async () => {
    const result = await getSettings("purple banana submarine", null, null);

    expect(result.status).toBe("invalid_input");
  }, 30000);

  // T4 intermittently returns invalid_input instead — tracked in KNOWN_ISSUES.md as a known prompt-variance weakness.
  it("T4: '?' only → status='clarification_required'", async () => {
    const result = await getSettings("?", null, null);

    expect(result.status).toBe("clarification_required");
  }, 30000);
});
