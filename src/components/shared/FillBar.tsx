"use client";

import { useLayoutEffect, useRef } from "react";

// Width is set via ref + CSSOM (never a JSX style={{}} attribute) so no
// style="" is ever served in markup — keeps CSP style-src clean of
// 'unsafe-inline'. Mirrors Spotlight.tsx's scroll-driven position update.
// useLayoutEffect (not useEffect) so the fill is set before the browser's
// first post-hydration paint — avoids a visible "0% then jump" frame.
export default function FillBar({
  pct,
  trackClassName,
  variant = "accent",
}: {
  pct: number;
  trackClassName: string;
  variant?: "accent" | "warning";
}) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    ref.current?.style.setProperty("--fill-pct", `${Math.max(pct, 3)}%`);
  }, [pct]);

  return (
    <div className={trackClassName}>
      <div
        ref={ref}
        className={`pw-fill-bar h-full rounded-full transition-[width] ${variant === "warning" ? "bg-warning" : "bg-accent"}`}
      />
    </div>
  );
}
