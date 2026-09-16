"use client";

import { useEffect, useState } from "react";

export interface VisualViewport {
  // Height of the visual viewport — the part of the layout viewport actually
  // on screen. null means the API is unavailable and callers must fall back
  // to whatever they did before (h-dvh, window.innerHeight, fixed anchoring).
  height: number | null;
  // How far the visual viewport has been panned down inside the layout
  // viewport. iOS pans to reveal a focused field near the bottom edge; the
  // layout viewport itself never moves, so anything anchored to it has to
  // add this back to stay on screen.
  offsetTop: number;
  // Distance from the layout viewport's bottom edge up to the bottom edge of
  // the visible band, i.e. how much of the layout viewport the keyboard is
  // covering. `position: fixed` resolves against the layout viewport, so a
  // fixed-bottom element needs exactly this much bottom offset to sit on the
  // visible edge instead of behind the keyboard. 0 when the API is absent, so
  // adding it is a no-op on browsers without it.
  bottomInset: number;
}

const ABSENT: VisualViewport = { height: null, offsetTop: 0, bottomInset: 0 };

/**
 * Tracks window.visualViewport.
 *
 * The software keyboard is the reason this exists. Neither iOS Safari nor
 * Chrome Android shrinks the layout viewport for it — `interactive-widget`
 * defaults to `resizes-visual`, so the keyboard shrinks only the visual
 * viewport and the ICB is untouched. That means 100dvh, 100vh and
 * window.innerHeight all keep reporting the full pre-keyboard height, and
 * anything sized or anchored by them sits behind the keyboard.
 *
 * Reads are coalesced through requestAnimationFrame rather than a timer:
 * these events fire per frame during the keyboard animation, and a rAF
 * callback lands in the same frame as the paint that follows it, so the
 * inset never trails the keyboard by a fixed delay the way a debounce timer
 * would.
 */
export function useVisualViewport(): VisualViewport {
  const [viewport, setViewport] = useState<VisualViewport>(ABSENT);

  useEffect(() => {
    const vv = window.visualViewport;
    // Feature detection, not a capability check: without it every caller
    // keeps its pre-existing behaviour rather than getting a broken
    // approximation.
    if (!vv) return;

    let frame = 0;

    const read = () => {
      frame = 0;
      // window.innerHeight, not vv.height: with `resizes-visual` the former
      // keeps reporting the full layout-viewport height, which is what a
      // fixed element's containing block actually is.
      const bottomInset = Math.max(
        0,
        Math.round(window.innerHeight - (vv.offsetTop + vv.height)),
      );
      setViewport((prev) =>
        prev.height === vv.height &&
        prev.offsetTop === vv.offsetTop &&
        prev.bottomInset === bottomInset
          ? prev
          : { height: vv.height, offsetTop: vv.offsetTop, bottomInset },
      );
    };

    const schedule = () => {
      if (frame === 0) frame = requestAnimationFrame(read);
    };

    read();
    vv.addEventListener("resize", schedule);
    vv.addEventListener("scroll", schedule);
    return () => {
      if (frame !== 0) cancelAnimationFrame(frame);
      vv.removeEventListener("resize", schedule);
      vv.removeEventListener("scroll", schedule);
    };
  }, []);

  return viewport;
}
