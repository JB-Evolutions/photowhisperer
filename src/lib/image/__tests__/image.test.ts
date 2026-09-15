import { describe, it, expect } from "vitest";
import { computeHistogram, luma } from "../histogram";
import { UnsupportedImageError, ImageTooLargeError } from "../errors";
import {
  assertInputSize,
  assertOutputSize,
  fitWithin,
  IMAGE_ACCEPT,
  MAX_INPUT_BYTES,
  MAX_OUTPUT_BASE64_BYTES,
} from "../limits";

function rgba(pixels: [number, number, number][]): Uint8ClampedArray {
  const out = new Uint8ClampedArray(pixels.length * 4);
  pixels.forEach(([r, g, b], i) => out.set([r, g, b, 255], i * 4));
  return out;
}

describe("luma", () => {
  it("uses Rec.709 weights", () => {
    expect(luma(255, 255, 255)).toBeCloseTo(255, 10);
    expect(luma(100, 0, 0)).toBeCloseTo(21.26, 10);
    expect(luma(0, 100, 0)).toBeCloseTo(71.52, 10);
    expect(luma(0, 0, 100)).toBeCloseTo(7.22, 10);
  });
});

describe("computeHistogram", () => {
  it("counts luma < 16 as shadow and > 239 as highlight, boundaries excluded", () => {
    const data = rgba([
      [15, 15, 15], // shadow
      [16, 16, 16], // boundary — not clipped
      [239, 239, 239], // boundary — not clipped
      [240, 240, 240], // highlight
    ]);
    expect(computeHistogram(data, 1)).toEqual({ shadowClipPct: 25, highlightClipPct: 25 });
  });

  it("uses luma, not a channel average — saturated blue is a shadow", () => {
    // (0, 0, 200): average 66.7, luma 14.44
    expect(computeHistogram(rgba([[0, 0, 200]]), 1).shadowClipPct).toBe(100);
  });

  it("samples every 4th pixel by default", () => {
    // Pixels 0 and 4 are sampled and black; the six unsampled pixels are white.
    const pixels: [number, number, number][] = Array.from({ length: 8 }, (_, i) =>
      i % 4 === 0 ? [0, 0, 0] : [255, 255, 255],
    );
    expect(computeHistogram(rgba(pixels))).toEqual({ shadowClipPct: 100, highlightClipPct: 0 });
  });

  it("returns zeros for an empty buffer", () =>
    expect(computeHistogram(new Uint8ClampedArray(0))).toEqual({ shadowClipPct: 0, highlightClipPct: 0 }));
});

describe("size guards", () => {
  it("allows exactly 25MB and rejects one byte more", () => {
    expect(MAX_INPUT_BYTES).toBe(25 * 1024 * 1024);
    expect(() => assertInputSize(MAX_INPUT_BYTES)).not.toThrow();
    expect(() => assertInputSize(MAX_INPUT_BYTES + 1)).toThrow(ImageTooLargeError);
  });

  it("rejects base64 output over 3MB", () => {
    expect(MAX_OUTPUT_BASE64_BYTES).toBe(3 * 1024 * 1024);
    expect(() => assertOutputSize("A".repeat(MAX_OUTPUT_BASE64_BYTES))).not.toThrow();
    expect(() => assertOutputSize("A".repeat(MAX_OUTPUT_BASE64_BYTES + 1))).toThrow(ImageTooLargeError);
  });

  it("reports the stage and sizes on the error", () => {
    try {
      assertInputSize(MAX_INPUT_BYTES + 10);
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(ImageTooLargeError);
      expect(err).toMatchObject({ stage: "input", bytes: MAX_INPUT_BYTES + 10, limitBytes: MAX_INPUT_BYTES });
    }
  });
});

describe("fitWithin", () => {
  it("scales a landscape long edge to 1024", () =>
    expect(fitWithin(4032, 3024, 1024)).toEqual({ width: 1024, height: 768 }));
  it("scales a portrait long edge to 1024", () =>
    expect(fitWithin(3024, 4032, 1024)).toEqual({ width: 768, height: 1024 }));
  it("never upscales a smaller source", () =>
    expect(fitWithin(800, 600, 1024)).toEqual({ width: 800, height: 600 }));
  it("never rounds a dimension down to 0", () =>
    expect(fitWithin(10000, 1, 256)).toEqual({ width: 256, height: 1 }));
});

describe("error types", () => {
  it("UnsupportedImageError is a typed Error carrying its cause", () => {
    const cause = new DOMException("decode failed", "InvalidStateError");
    const err = new UnsupportedImageError("nope", { cause });
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(UnsupportedImageError);
    expect(err.name).toBe("UnsupportedImageError");
    expect(err.code).toBe("unsupported_image");
    expect(err.cause).toBe(cause);
  });

  it("ImageTooLargeError is distinguishable from UnsupportedImageError", () => {
    const err = new ImageTooLargeError("output", 5, 4);
    expect(err).not.toBeInstanceOf(UnsupportedImageError);
    expect(err.name).toBe("ImageTooLargeError");
    expect(err.code).toBe("image_too_large");
  });
});

describe("IMAGE_ACCEPT", () => {
  it("is exactly jpeg, png, webp — never heic", () => {
    expect(IMAGE_ACCEPT).toBe("image/jpeg,image/png,image/webp");
    expect(IMAGE_ACCEPT).not.toMatch(/heic|heif/i);
  });
});
