import { ImageTooLargeError } from "./errors";

// Never add image/heic: Safari 17+ responds by converting the user's JPEG into
// a HEIC with a temp filename.
export const IMAGE_ACCEPT = "image/jpeg,image/png,image/webp";

// A 12MP photo needs ~48MB to decode and will OOM low-end Android; reject
// anything this large before it reaches createImageBitmap.
export const MAX_INPUT_BYTES = 25 * 1024 * 1024;
export const MAX_OUTPUT_BASE64_BYTES = 3 * 1024 * 1024;

export const LONG_EDGE_PX = 1024;
export const THUMBNAIL_LONG_EDGE_PX = 256;
export const JPEG_QUALITY = 0.85;

export function assertInputSize(bytes: number): void {
  if (bytes > MAX_INPUT_BYTES) throw new ImageTooLargeError("input", bytes, MAX_INPUT_BYTES);
}

// base64 is ASCII, so string length is the byte count.
export function assertOutputSize(base64: string): void {
  if (base64.length > MAX_OUTPUT_BASE64_BYTES) {
    throw new ImageTooLargeError("output", base64.length, MAX_OUTPUT_BASE64_BYTES);
  }
}

// Scales so the long edge is at most maxEdge. Never upscales.
export function fitWithin(
  width: number,
  height: number,
  maxEdge: number,
): { width: number; height: number } {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}
