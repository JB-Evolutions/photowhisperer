import type { Histogram } from "@/lib/exposure/types";

export const SHADOW_CLIP_LUMA = 16; // luma strictly below this counts as clipped shadow
export const HIGHLIGHT_CLIP_LUMA = 239; // luma strictly above this counts as clipped highlight
export const HISTOGRAM_SAMPLE_EVERY = 4;

export function luma(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// rgba is canvas ImageData.data layout: 4 bytes per pixel, alpha ignored.
export function computeHistogram(
  rgba: ArrayLike<number>,
  sampleEvery: number = HISTOGRAM_SAMPLE_EVERY,
): Histogram {
  const step = 4 * sampleEvery;
  let sampled = 0;
  let shadows = 0;
  let highlights = 0;

  for (let i = 0; i + 2 < rgba.length; i += step) {
    const y = luma(rgba[i], rgba[i + 1], rgba[i + 2]);
    sampled++;
    if (y < SHADOW_CLIP_LUMA) shadows++;
    else if (y > HIGHLIGHT_CLIP_LUMA) highlights++;
  }

  if (sampled === 0) return { shadowClipPct: 0, highlightClipPct: 0 };
  return {
    shadowClipPct: (shadows / sampled) * 100,
    highlightClipPct: (highlights / sampled) * 100,
  };
}
