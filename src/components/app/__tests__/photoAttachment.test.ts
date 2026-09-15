import { describe, expect, it } from "vitest";
import { ImageTooLargeError, UnsupportedImageError } from "@/lib/image/errors";
import type { PreparedImage } from "@/lib/image/prepare";
import {
  ATTACHMENT_ERROR_COPY,
  attachmentErrorKind,
  buildImagePayload,
  jpegDataUri,
  responseAssumptions,
  shortfallLine,
} from "@/components/app/photoAttachment";

describe("attachmentErrorKind", () => {
  it("tells the error classes apart", () => {
    expect(attachmentErrorKind(new UnsupportedImageError("heic"))).toBe("unsupported");
    expect(attachmentErrorKind(new ImageTooLargeError("input", 30_000_000, 25 * 1024 * 1024))).toBe("too_large");
    expect(attachmentErrorKind(new ImageTooLargeError("output", 4_000_000, 3 * 1024 * 1024))).toBe("too_large_prepared");
    expect(attachmentErrorKind(new Error("decode failed"))).toBe("unreadable");
    expect(attachmentErrorKind(null)).toBe("unreadable");
  });

  it("falls back to the error code across realms", () => {
    expect(attachmentErrorKind({ code: "unsupported_image" })).toBe("unsupported");
    expect(attachmentErrorKind({ code: "image_too_large", stage: "input" })).toBe("too_large");
    expect(attachmentErrorKind({ code: "image_too_large", stage: "output" })).toBe("too_large_prepared");
  });

  it("has distinct copy for each kind, naming the 25 MB limit", () => {
    const copies = Object.values(ATTACHMENT_ERROR_COPY);
    expect(new Set(copies).size).toBe(copies.length);
    expect(ATTACHMENT_ERROR_COPY.too_large).toContain("25 MB");
    for (const copy of copies) expect(copy).not.toMatch(/heic|exif|metadata/i);
  });
});

describe("shortfallLine", () => {
  it("words a locked-ISO shortfall", () => {
    expect(shortfallLine(2, 100, "locked")).toBe(
      "Locked at ISO 100, this is about 2 stops darker than correct — the shot will be underexposed.",
    );
  });

  it("leads with the ISO mode", () => {
    expect(shortfallLine(1, 3200, "capped")).toBe(
      "Capped at ISO 3200, this is about 1 stop darker than correct — the shot will be underexposed.",
    );
    expect(shortfallLine(3.2, 6400, "auto")).toMatch(/^Even at ISO 6400, this is about 3 stops/);
    expect(shortfallLine(3, 6400, null)).toMatch(/^Even at ISO 6400/);
  });

  it("says 'under a stop' for small shortfalls", () => {
    expect(shortfallLine(0.4, 100, "locked")).toContain("this is under a stop darker");
  });

  it("is silent when exposure is reachable", () => {
    expect(shortfallLine(0, 100, "locked")).toBeNull();
    expect(shortfallLine(undefined, 100, "locked")).toBeNull();
    expect(shortfallLine(Number.NaN, 100, "locked")).toBeNull();
  });
});

describe("responseAssumptions", () => {
  it("appends the floor explanation and shortfall, without duplicates", () => {
    const lines = responseAssumptions(
      {
        iso: 100,
        assumptions: ["Handheld", "Shutter held at 1/60 for a moving subject"],
        floorExplain: "Shutter held at 1/60 for a moving subject",
        shortfallStops: 2,
      },
      "locked",
    );
    expect(lines).toEqual([
      "Handheld",
      "Shutter held at 1/60 for a moving subject",
      "Locked at ISO 100, this is about 2 stops darker than correct — the shot will be underexposed.",
    ]);
  });

  it("leaves older responses untouched", () => {
    expect(responseAssumptions({ iso: 400, assumptions: ["Handheld"] }, null)).toEqual(["Handheld"]);
  });
});

describe("buildImagePayload", () => {
  const base = {
    jpegBase64: "AAAA",
    thumbnailBase64: "BBBB",
    exif: null,
    histogram: { bins: [] },
  };

  it("flags HDR-suspect captures from raw EXIF", () => {
    const payload = buildImagePayload({ ...base, rawExif: { CustomRendered: 1 } } as unknown as PreparedImage);
    expect(payload.rawExifFlags).toEqual({ hdrSuspect: true });
    expect(payload.jpegBase64).toBe("AAAA");
    expect(payload.thumbnailBase64).toBe("BBBB");
    expect(Object.keys(payload).sort()).toEqual(["exif", "histogram", "jpegBase64", "rawExifFlags", "thumbnailBase64"]);
  });

  it("does not flag a capture with no EXIF", () => {
    const payload = buildImagePayload({ ...base, rawExif: null } as unknown as PreparedImage);
    expect(payload.rawExifFlags).toEqual({ hdrSuspect: false });
  });

  it("builds data: URIs (blob: is blocked by the CSP)", () => {
    expect(jpegDataUri("AAAA")).toBe("data:image/jpeg;base64,AAAA");
  });
});
