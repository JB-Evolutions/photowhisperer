import { describe, it, expect } from "vitest";
import { isHdrSuspect, isPhoneMake } from "../hdr";
import { exifExposureFromRaw } from "../exif";

const PLAIN_IPHONE = {
  Make: "Apple",
  Model: "iPhone 15 Pro",
  FNumber: 1.78,
  ExposureTime: 1 / 120,
  ISO: 320,
  CustomRendered: 0,
  SceneCaptureType: 0,
};

describe("isHdrSuspect", () => {
  it("false for a plain single-frame phone photo", () => expect(isHdrSuspect(PLAIN_IPHONE)).toBe(false));
  it("false for null", () => expect(isHdrSuspect(null)).toBe(false));

  it("true when CustomRendered is non-zero", () =>
    expect(isHdrSuspect({ ...PLAIN_IPHONE, CustomRendered: 4 })).toBe(true));

  it.each([2, 3])("true when CompositeImage is %d", (value) =>
    expect(isHdrSuspect({ ...PLAIN_IPHONE, CompositeImage: value })).toBe(true));

  it.each([0, 1])("false when CompositeImage is %d", (value) =>
    expect(isHdrSuspect({ ...PLAIN_IPHONE, CompositeImage: value })).toBe(false));

  it("true when SceneCaptureType is Night scene (3)", () =>
    expect(isHdrSuspect({ ...PLAIN_IPHONE, SceneCaptureType: 3 })).toBe(true));

  it("true for a phone reporting longer than 1/8s", () =>
    expect(isHdrSuspect({ ...PLAIN_IPHONE, ExposureTime: 0.25 })).toBe(true));

  it("false for a phone at exactly 1/8s", () =>
    expect(isHdrSuspect({ ...PLAIN_IPHONE, ExposureTime: 0.125 })).toBe(false));

  it("false for a dedicated camera at a long exposure", () =>
    expect(isHdrSuspect({ ...PLAIN_IPHONE, Make: "Canon", Model: "EOS R6", ExposureTime: 2 })).toBe(false));
});

describe("isPhoneMake", () => {
  it.each(["Apple", "Google", "samsung", "Xiaomi", "OnePlus", "HUAWEI"])("%s is a phone", (make) =>
    expect(isPhoneMake(make)).toBe(true));
  it.each(["Canon", "NIKON CORPORATION", "FUJIFILM", "OLYMPUS"])("%s is not a phone", (make) =>
    expect(isPhoneMake(make)).toBe(false));
  it("Sony Xperia is a phone, Sony Alpha is not", () => {
    expect(isPhoneMake("Sony", "XQ-DQ72")).toBe(true);
    expect(isPhoneMake("SONY", "ILCE-7M4")).toBe(false);
  });
  it("Samsung NX cameras are not phones", () => expect(isPhoneMake("SAMSUNG", "NX1")).toBe(false));
});

describe("exifExposureFromRaw", () => {
  it("maps exifr keys", () =>
    expect(exifExposureFromRaw({ ...PLAIN_IPHONE, ExposureCompensation: -0.7 })).toEqual({
      fNumber: 1.78,
      exposureTimeS: 1 / 120,
      iso: 320,
      exposureBiasEv: -0.7,
    }));

  it("defaults a missing bias to 0", () => expect(exifExposureFromRaw(PLAIN_IPHONE)?.exposureBiasEv).toBe(0));

  it("takes the first entry of a multi-value ISO tag", () =>
    expect(exifExposureFromRaw({ ...PLAIN_IPHONE, ISO: [640, 0] })?.iso).toBe(640));

  it.each(["FNumber", "ExposureTime", "ISO"])("null when %s is missing", (key) => {
    const raw: Record<string, unknown> = { ...PLAIN_IPHONE };
    delete raw[key];
    expect(exifExposureFromRaw(raw)).toBeNull();
  });

  it("null when a value is zero", () => expect(exifExposureFromRaw({ ...PLAIN_IPHONE, FNumber: 0 })).toBeNull());
  it("null for null input", () => expect(exifExposureFromRaw(null)).toBeNull());
});
