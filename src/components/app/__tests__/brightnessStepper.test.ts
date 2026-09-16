import { describe, expect, it } from "vitest";
import { INTENT_STOPS } from "@/lib/contract/types";
import {
  INTENT_ORDER,
  canStepIntent,
  intentIndex,
  intentStepperLabel,
  stepIntent,
} from "@/components/app/conditions";

describe("stepper order", () => {
  it("walks dimmest to brightest", () => {
    expect([...INTENT_ORDER]).toEqual(["moody", "natural", "bright"]);
  });

  it("reads its stops from the contract rather than restating them", () => {
    expect(INTENT_ORDER.map((i) => INTENT_STOPS[i])).toEqual([-1, 0, 1]);
  });

  it("indexes every intent", () => {
    expect(INTENT_ORDER.map(intentIndex)).toEqual([0, 1, 2]);
  });
});

describe("stepIntent", () => {
  it("steps forward through each stop", () => {
    expect(stepIntent("moody", 1)).toBe("natural");
    expect(stepIntent("natural", 1)).toBe("bright");
  });

  it("steps back through each stop", () => {
    expect(stepIntent("bright", -1)).toBe("natural");
    expect(stepIntent("natural", -1)).toBe("moody");
  });

  it("clamps at bright — never wraps round to moody", () => {
    expect(stepIntent("bright", 1)).toBe("bright");
  });

  it("clamps at moody — never wraps round to bright", () => {
    expect(stepIntent("moody", -1)).toBe("moody");
  });
});

describe("canStepIntent", () => {
  it("disables the left chevron only at moody", () => {
    expect(canStepIntent("moody", -1)).toBe(false);
    expect(canStepIntent("natural", -1)).toBe(true);
    expect(canStepIntent("bright", -1)).toBe(true);
  });

  it("disables the right chevron only at bright", () => {
    expect(canStepIntent("bright", 1)).toBe(false);
    expect(canStepIntent("natural", 1)).toBe(true);
    expect(canStepIntent("moody", 1)).toBe(true);
  });

  it("leaves both chevrons live in the middle", () => {
    expect(canStepIntent("natural", -1) && canStepIntent("natural", 1)).toBe(true);
  });
});

describe("intentStepperLabel", () => {
  it("shows the word alone at zero stops", () => {
    expect(intentStepperLabel("natural")).toBe("Natural");
  });

  it("shows a signed stop either side", () => {
    expect(intentStepperLabel("moody")).toBe("Moody −1");
    expect(intentStepperLabel("bright")).toBe("Bright +1");
  });

  it("uses U+2212 so the minus aligns with the plus", () => {
    expect(intentStepperLabel("moody")).toContain("−");
    expect(intentStepperLabel("moody")).not.toContain("-");
  });

  it("stays shorter than the panel's wording, which is pinned separately", () => {
    for (const intent of INTENT_ORDER) {
      expect(intentStepperLabel(intent)).not.toContain("stop");
    }
  });
});
