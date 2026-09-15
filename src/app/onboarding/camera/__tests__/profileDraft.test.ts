import { describe, expect, it } from "vitest";
import { cropFactorForBody } from "../bodies";
import { draftFromLabel, editField } from "../lensDraft";
import {
  EMPTY_BODY_DRAFT,
  bodyDraftToProfile,
  buildProfilePayload,
  editCropFactor,
  formatIsoSummary,
  formatLensSpec,
  setBodyLabel,
} from "../profileDraft";

describe("cropFactorForBody", () => {
  it("looks up listed bodies, ignoring case and spacing", () => {
    expect(cropFactorForBody("Canon R6")).toBe(1);
    expect(cropFactorForBody("  sony   a6400 ")).toBe(1.5);
    expect(cropFactorForBody("Canon R7")).toBe(1.6);
  });

  it("returns unknown rather than guessing", () => {
    expect(cropFactorForBody("iPhone 15 Pro")).toBeNull();
    expect(cropFactorForBody("Canon R")).toBeNull();
    expect(cropFactorForBody("")).toBeNull();
  });
});

describe("body draft", () => {
  it("fills crop factor from the body until the user types one", () => {
    let d = setBodyLabel(EMPTY_BODY_DRAFT, "Fujifilm X-T5");
    expect(d.cropFactor).toBe("1.5");
    d = setBodyLabel(d, "Some old film camera");
    expect(d.cropFactor).toBe("");
    d = editCropFactor(d, "1.3");
    d = setBodyLabel(d, "Canon R5");
    expect(d.cropFactor).toBe("1.3");
  });

  it("treats an untouched step as all-unknown with auto ISO", () => {
    expect(bodyDraftToProfile(EMPTY_BODY_DRAFT)).toEqual({
      ok: true,
      value: { body: null, cropFactor: null, ibisStops: null, isoBase: 100, isoMode: "auto", isoValue: null, isoMax: null },
    });
  });

  it("stores IBIS no as 0 and yes-without-stops as null", () => {
    const no = bodyDraftToProfile({ ...EMPTY_BODY_DRAFT, ibis: "no", ibisStops: "5" });
    expect(no.ok && no.value.ibisStops).toBe(0);
    const yes = bodyDraftToProfile({ ...EMPTY_BODY_DRAFT, ibis: "yes" });
    expect(yes.ok && yes.value.ibisStops).toBeNull();
    const five = bodyDraftToProfile({ ...EMPTY_BODY_DRAFT, ibis: "yes", ibisStops: "5" });
    expect(five.ok && five.value.ibisStops).toBe(5);
  });

  it("requires the ISO for locked and capped modes, and drops stale values", () => {
    expect(bodyDraftToProfile({ ...EMPTY_BODY_DRAFT, isoMode: "locked" })).toMatchObject({ ok: false, field: "isoValue" });
    expect(bodyDraftToProfile({ ...EMPTY_BODY_DRAFT, isoMode: "capped", isoMax: "32OO" })).toMatchObject({ ok: false, field: "isoMax" });
    const locked = bodyDraftToProfile({ ...EMPTY_BODY_DRAFT, isoMode: "locked", isoValue: "100", isoMax: "6400" });
    expect(locked).toMatchObject({ ok: true, value: { isoMode: "locked", isoValue: 100, isoMax: null } });
    const auto = bodyDraftToProfile({ ...EMPTY_BODY_DRAFT, isoValue: "100", isoMax: "6400" });
    expect(auto).toMatchObject({ ok: true, value: { isoValue: null, isoMax: null } });
  });

  it("rejects a non-numeric crop factor", () => {
    expect(bodyDraftToProfile({ ...EMPTY_BODY_DRAFT, cropFactor: "APS-C" })).toMatchObject({ ok: false, field: "cropFactor" });
  });
});

describe("buildProfilePayload", () => {
  it("builds the structured PUT body with lenses in order", () => {
    const result = buildProfilePayload(setBodyLabel(EMPTY_BODY_DRAFT, "Canon R6"), [
      draftFromLabel("a", "RF 50mm f/1.8"),
      draftFromLabel("b", "my old zoom"),
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload.body).toBe("Canon R6");
    expect(result.payload.structured.cropFactor).toBe(1);
    expect(result.payload.structured.lenses.map((l) => [l.label, l.confidence])).toEqual([
      ["RF 50mm f/1.8", "high"],
      ["my old zoom", "unknown"],
    ]);
    expect("body" in result.payload.structured).toBe(false);
  });

  it("points at the lens that failed", () => {
    const bad = editField(draftFromLabel("b", "my old zoom"), "focalMin", "abc");
    expect(buildProfilePayload(EMPTY_BODY_DRAFT, [draftFromLabel("a", "RF 50mm f/1.8"), bad])).toEqual({
      ok: false,
      step: 2,
      lensKey: "b",
      message: "Focal length needs to be a number in mm.",
    });
  });
});

describe("summaries", () => {
  it("formats lens specs, leaving unknowns out", () => {
    const lens = { label: "", stabilised: null, stabStops: null, confidence: "high" as const };
    expect(formatLensSpec({ ...lens, focalMinMm: 24, focalMaxMm: 70, aperWide: 2.8, aperTele: 2.8, stabilised: true })).toBe(
      "24–70mm · f/2.8 · Stabilised",
    );
    expect(formatLensSpec({ ...lens, focalMinMm: 18, focalMaxMm: 55, aperWide: 3.5, aperTele: 5.6 })).toBe("18–55mm · f/3.5–5.6");
    expect(formatLensSpec({ ...lens, focalMinMm: 35, focalMaxMm: 35, aperWide: null, aperTele: null })).toBe("35mm");
    expect(formatLensSpec({ ...lens, focalMinMm: null, focalMaxMm: null, aperWide: null, aperTele: null })).toBe("No details yet");
  });

  it("formats the ISO mode", () => {
    expect(formatIsoSummary({ isoMode: "auto", isoValue: null, isoMax: null })).toBe("Auto");
    expect(formatIsoSummary({ isoMode: "locked", isoValue: 100, isoMax: null })).toBe("Locked at ISO 100");
    expect(formatIsoSummary({ isoMode: "capped", isoValue: null, isoMax: 3200 })).toBe("Auto, up to ISO 3200");
  });
});
