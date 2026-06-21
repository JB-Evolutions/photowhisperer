"use client";

import { useEffect, useRef } from "react";
import type { ReactNode } from "react";

export default function PricingScrollTrack({
  children,
  featuredTier,
}: {
  children: ReactNode;
  featuredTier: string;
}) {
  const trackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    // Desktop renders a static grid (no overflow) — only the mobile
    // carousel needs an initial scroll position.
    const isDesktop = window.matchMedia("(min-width: 768px)").matches;
    if (isDesktop) return;

    const featured = track.querySelector<HTMLElement>(`[data-tier="${featuredTier}"]`);
    if (!featured) return;

    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    // Center the featured card within the track itself — scrollIntoView
    // would bubble to the nearest scrollable ancestor (the page) and
    // hijack vertical scroll position on mount.
    const left =
      featured.offsetLeft - (track.clientWidth - featured.clientWidth) / 2;
    track.scrollTo({ left, behavior: prefersReducedMotion ? "auto" : "smooth" });
  }, [featuredTier]);

  return (
    <div
      ref={trackRef}
      role="region"
      aria-label="Pricing tiers"
      tabIndex={0}
      className="flex gap-6 overflow-x-auto snap-x snap-mandatory scroll-px-8 pt-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:grid md:grid-cols-3 md:gap-8 md:overflow-visible md:snap-none md:pt-0"
    >
      {children}
    </div>
  );
}
