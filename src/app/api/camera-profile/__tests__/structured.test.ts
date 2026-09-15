import { describe, expect, it } from "vitest";
import { MAX_LENSES, validateStructuredProfile } from "../structured";

const lens = {
  label: "RF 50mm f/1.8",
  focalMinMm: 50,
  focalMaxMm: 50,
  aperWide: 1.8,
  aperTele: 1.8,
  stabilised: false,
  stabStops: null,
  confidence: "high",
};

const valid = {
  cropFactor: 1,
  ibisStops: null,
  isoBase: 100,
  isoMode: "auto",
  isoValue: null,
  isoMax: null,
  lenses: [lens],
};

function messageFor(body: unknown, raw: unknown): string | null {
  const r = validateStructuredProfile(body, raw);
  return r.ok ? null : r.message;
}

describe("validateStructuredProfile", () => {
  it("accepts a complete profile", () => {
    const r = validateStructuredProfile("Canon R6", valid);
    expect(r).toEqual({ ok: true, value: { body: "Canon R6", ...valid } });
  });

  it("accepts all-unknown values", () => {
    const r = validateStructuredProfile(null, {
      ...valid,
      cropFactor: null,
      lenses: [{ ...lens, focalMinMm: null, focalMaxMm: null, aperWide: null, aperTele: null, stabilised: null, confidence: "unknown" }],
    });
    expect(r.ok).toBe(true);
  });

  it("rejects missing or malformed numbers rather than defaulting them", () => {
    expect(messageFor(null, { ...valid, cropFactor: undefined })).toMatch(/cropFactor/);
    expect(messageFor(null, { ...valid, cropFactor: 0 })).toMatch(/cropFactor/);
    expect(messageFor(null, { ...valid, ibisStops: -1 })).toMatch(/ibisStops/);
    expect(messageFor(null, { ...valid, isoBase: 100.5 })).toMatch(/isoBase/);
    expect(messageFor(null, { ...valid, isoMode: "manual" })).toMatch(/isoMode/);
  });

  it("allows zero IBIS stops", () => {
    expect(validateStructuredProfile(null, { ...valid, ibisStops: 0 }).ok).toBe(true);
  });

  it("requires the ISO that goes with locked and capped modes", () => {
    expect(messageFor(null, { ...valid, isoMode: "locked" })).toMatch(/isoValue is required/);
    expect(messageFor(null, { ...valid, isoMode: "capped" })).toMatch(/isoMax is required/);
    expect(validateStructuredProfile(null, { ...valid, isoMode: "locked", isoValue: 100 }).ok).toBe(true);
  });

  it("checks each lens", () => {
    expect(messageFor(null, { ...valid, lenses: [{ ...lens, label: " " }] })).toMatch(/lenses\[0\]\.label/);
    expect(messageFor(null, { ...valid, lenses: [lens, { ...lens, stabilised: "yes" }] })).toMatch(/lenses\[1\]\.stabilised/);
    expect(messageFor(null, { ...valid, lenses: [{ ...lens, confidence: "medium" }] })).toMatch(/confidence/);
    expect(messageFor(null, { ...valid, lenses: [{ ...lens, focalMinMm: 70, focalMaxMm: 24 }] })).toMatch(/focalMaxMm/);
    expect(messageFor(null, { ...valid, lenses: [{ ...lens, aperWide: 5.6, aperTele: 3.5 }] })).toMatch(/aperTele/);
  });

  it("caps the number of lenses and the body label", () => {
    expect(messageFor(null, { ...valid, lenses: Array(MAX_LENSES + 1).fill(lens) })).toMatch(/at most/);
    expect(validateStructuredProfile(null, { ...valid, lenses: Array(MAX_LENSES).fill(lens) }).ok).toBe(true);
    expect(messageFor("x".repeat(256), valid)).toMatch(/body/);
    expect(messageFor(null, null)).toMatch(/structured/);
  });
});
