import { describe, expect, it } from "vitest";
import {
  draftFromLabel,
  draftToLens,
  editField,
  fieldBorder,
  hasGuesses,
  moveItem,
  reparseDraft,
  setStabilised,
  stabilisedBorder,
  type LensField,
} from "../lensDraft";

const FIELDS: LensField[] = ["focalMin", "focalMax", "aperWide", "aperTele"];

function borders(label: string) {
  const d = draftFromLabel("k", label);
  return FIELDS.map((f) => fieldBorder(d, f));
}

describe("draftFromLabel", () => {
  it("reads a fully specified prime as solid", () => {
    const d = draftFromLabel("k", "RF 50mm f/1.8");
    expect([d.focalMin, d.focalMax, d.aperWide, d.aperTele]).toEqual(["50", "50", "1.8", "1.8"]);
    expect(borders("RF 50mm f/1.8")).toEqual(["solid", "solid", "solid", "solid"]);
    expect(hasGuesses(d)).toBe(false);
    expect(d.label).toBe("RF 50mm f/1.8");
  });

  it("marks kit-table apertures as guesses", () => {
    const d = draftFromLabel("k", "Canon 18-55mm");
    expect([d.focalMin, d.focalMax]).toEqual(["18", "55"]);
    expect(d.guessed.sort()).toEqual(["aperTele", "aperWide"]);
    expect(borders("Canon 18-55mm")).toEqual(["solid", "solid", "dashed", "dashed"]);
    expect(hasGuesses(d)).toBe(true);
    expect(stabilisedBorder(d)).toBe("dashed");
  });

  it("leaves unreadable names genuinely empty", () => {
    const d = draftFromLabel("k", "my old zoom");
    expect([d.focalMin, d.focalMax, d.aperWide, d.aperTele]).toEqual(["", "", "", ""]);
    expect(borders("my old zoom")).toEqual(["dashed", "dashed", "dashed", "dashed"]);
    expect(hasGuesses(d)).toBe(false);
    expect(d.label).toBe("my old zoom");
  });

  it("never invents an aperture the name doesn't give", () => {
    const d = draftFromLabel("k", "Sigma 35mm");
    expect([d.focalMin, d.focalMax, d.aperWide, d.aperTele]).toEqual(["35", "35", "", ""]);
    expect(borders("Sigma 35mm")).toEqual(["solid", "solid", "dashed", "dashed"]);
  });
});

describe("editing", () => {
  it("clears a guess once the field is edited", () => {
    const d = editField(draftFromLabel("k", "Canon 18-55mm"), "aperWide", "4");
    expect(fieldBorder(d, "aperWide")).toBe("solid");
    expect(fieldBorder(d, "aperTele")).toBe("dashed");
  });

  it("keeps hand-typed fields when the label is re-parsed", () => {
    let d = editField(draftFromLabel("k", "my old zoom"), "focalMin", "28");
    d = reparseDraft({ ...d, label: "FE 24-70mm f/2.8 GM" });
    expect([d.focalMin, d.focalMax, d.aperWide, d.aperTele]).toEqual(["28", "70", "2.8", "2.8"]);
    expect(d.label).toBe("FE 24-70mm f/2.8 GM");
  });

  it("does nothing when the label hasn't changed", () => {
    const d = editField(draftFromLabel("k", "RF 50mm f/1.8"), "aperWide", "2");
    expect(reparseDraft(d)).toBe(d);
  });

  it("drops stabiliser stops unless stabilised", () => {
    const d = setStabilised({ ...draftFromLabel("k", "x"), stabilised: true, stabStops: 4 }, false);
    expect(d.stabStops).toBeNull();
    expect(stabilisedBorder(d)).toBe("solid");
  });
});

describe("draftToLens", () => {
  it("keeps guesses at low confidence", () => {
    const r = draftToLens(draftFromLabel("k", "Canon 18-55mm"));
    expect(r).toEqual({
      ok: true,
      lens: expect.objectContaining({ focalMinMm: 18, focalMaxMm: 55, aperWide: 3.5, aperTele: 5.6, confidence: "low" }),
    });
  });

  it("becomes high once every number is confirmed", () => {
    let d = draftFromLabel("k", "Canon 18-55mm");
    d = editField(d, "aperWide", "3.5");
    d = editField(d, "aperTele", "f/5.6");
    const r = draftToLens(d);
    expect(r.ok && r.lens.confidence).toBe("high");
    expect(r.ok && r.lens.aperTele).toBe(5.6);
  });

  it("saves unknowns as null, not zero", () => {
    const r = draftToLens(draftFromLabel("k", "my old zoom"));
    expect(r).toEqual({
      ok: true,
      lens: {
        label: "my old zoom",
        focalMinMm: null,
        focalMaxMm: null,
        aperWide: null,
        aperTele: null,
        stabilised: null,
        stabStops: null,
        confidence: "unknown",
      },
    });
  });

  it("rejects bad input with plain messages", () => {
    const base = draftFromLabel("k", "my old zoom");
    expect(draftToLens({ ...base, label: "  " })).toEqual({ ok: false, message: "Give this lens a name." });
    expect(draftToLens(editField(base, "focalMin", "wide"))).toEqual({ ok: false, message: "Focal length needs to be a number in mm." });
    expect(draftToLens(editField(base, "aperWide", "fast"))).toEqual({ ok: false, message: "Aperture needs to be a number, like 2.8." });
    expect(draftToLens(editField(editField(base, "focalMin", "70"), "focalMax", "24"))).toEqual({
      ok: false,
      message: "The long end can't be shorter than the short end.",
    });
    expect(draftToLens(editField(editField(base, "aperWide", "5.6"), "aperTele", "3.5"))).toEqual({
      ok: false,
      message: "The long-end aperture can't be wider than the short-end one.",
    });
  });
});

describe("moveItem", () => {
  it("reorders and ignores out-of-range moves", () => {
    expect(moveItem(["a", "b", "c"], 0, 1)).toEqual(["b", "a", "c"]);
    expect(moveItem(["a", "b", "c"], 2, 1)).toEqual(["a", "c", "b"]);
    const list = ["a", "b"];
    expect(moveItem(list, 0, -1)).toBe(list);
    expect(moveItem(list, 1, 2)).toBe(list);
  });
});
