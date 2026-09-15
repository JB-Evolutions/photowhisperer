import { exifExposureFromRaw } from "@/lib/exposure/exif";
import type { ExifExposure, Histogram, RawExif } from "@/lib/exposure/types";
import { UnsupportedImageError } from "./errors";
import { readRawExif } from "./exif";
import { computeHistogram, HISTOGRAM_SAMPLE_EVERY } from "./histogram";
import {
  assertInputSize,
  assertOutputSize,
  fitWithin,
  JPEG_QUALITY,
  LONG_EDGE_PX,
  THUMBNAIL_LONG_EDGE_PX,
} from "./limits";

export type PreparedImage = {
  jpegBase64: string;
  thumbnailBase64: string;
  exif: ExifExposure | null;
  rawExif: RawExif | null;
  histogram: Histogram;
  width: number; // of the prepared (≤1024px) image, orientation applied
  height: number;
};

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const CHUNK = 0x8000; // stays under engine argument-count limits
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

function context2d(canvas: OffscreenCanvas): OffscreenCanvasRenderingContext2D {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("OffscreenCanvas 2D context unavailable");
  return ctx;
}

async function encodeJpegBase64(canvas: OffscreenCanvas): Promise<string> {
  const blob = await canvas.convertToBlob({ type: "image/jpeg", quality: JPEG_QUALITY });
  return blobToBase64(blob);
}

// The step order is load-bearing: EXIF must be read from the untouched File
// before anything decodes or re-encodes it, or it's gone on every upload.
export async function prepareImage(file: File): Promise<PreparedImage> {
  assertInputSize(file.size);

  // 1. EXIF from the original blob.
  const rawExif = await readRawExif(file);
  const exif = exifExposureFromRaw(rawExif);

  // 2. Decode. "from-image" is required — without it portrait photos arrive
  // rotated 90° and every spatial judgement downstream is wrong.
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch (cause) {
    throw new UnsupportedImageError(
      `This browser can't decode ${file.type || "this image format"}.`,
      { cause },
    );
  }

  try {
    // 3. Long edge 1024px, never upscaled.
    const { width, height } = fitWithin(bitmap.width, bitmap.height, LONG_EDGE_PX);
    const canvas = new OffscreenCanvas(width, height);
    const ctx = context2d(canvas);
    ctx.drawImage(bitmap, 0, 0, width, height);

    // 4. Histogram off the 1024px canvas.
    const histogram = computeHistogram(
      ctx.getImageData(0, 0, width, height).data,
      HISTOGRAM_SAMPLE_EVERY,
    );

    // 5. JPEG → base64.
    const jpegBase64 = await encodeJpegBase64(canvas);
    assertOutputSize(jpegBase64);

    // 6. Thumbnail, drawn from the already-downscaled canvas.
    const thumbSize = fitWithin(width, height, THUMBNAIL_LONG_EDGE_PX);
    const thumb = new OffscreenCanvas(thumbSize.width, thumbSize.height);
    context2d(thumb).drawImage(canvas, 0, 0, thumbSize.width, thumbSize.height);
    const thumbnailBase64 = await encodeJpegBase64(thumb);

    return { jpegBase64, thumbnailBase64, exif, rawExif, histogram, width, height };
  } finally {
    bitmap.close();
  }
}
