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
}

const ABSENT: VisualViewport = { height: null, offsetTop: 0 };

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
      // Bail on an unchanged pair so a scroll storm can't re-render the
      // whole shell every frame for nothing.
      setViewport((prev) =>
        prev.height === vv.height && prev.offsetTop === vv.offsetTop
          ? prev
          : { height: vv.height, offsetTop: vv.offsetTop },
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
