"use client";

import { useEffect, useRef } from "react";

const ANCHORS: Record<string, { x: number; y: number }> = {
  hero: { x: 50, y: -250 },
  features: { x: 72, y: -200 },
  pricing: { x: 28, y: -200 },
  faq: { x: 60, y: -180 },
  app: { x: 50, y: -150 },
};

export default function Spotlight() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    if (prefersReducedMotion) return;

    const spotlight = ref.current;
    if (!spotlight) return;

    let ticking = false;
    let currentAnchor = "hero";

    function updateSpotlight() {
      const sections = Array.from(
        document.querySelectorAll<HTMLElement>("[data-section]")
      );
      if (sections.length === 0) {
        ticking = false;
        return;
      }
      const vh = window.innerHeight;
      let best = sections[0];
      let bestScore = -Infinity;
      sections.forEach((s) => {
        const rect = s.getBoundingClientRect();
        const top = Math.max(rect.top, 0);
        const bottom = Math.min(rect.bottom, vh);
        const visible = Math.max(0, bottom - top);
        const center = (rect.top + rect.bottom) / 2;
        const centerDist = Math.abs(center - vh / 2);
        const score = visible - centerDist * 0.3;
        if (score > bestScore) {
          bestScore = score;
          best = s;
        }
      });
      const key = best.dataset.section ?? "hero";
      if (key !== currentAnchor) {
        currentAnchor = key;
        const a = ANCHORS[key] ?? ANCHORS.hero;
        spotlight.style.left = `${a.x}%`;
        spotlight.style.top = `${a.y}px`;
      }
      ticking = false;
    }

    function onScroll() {
      if (!ticking) {
        window.requestAnimationFrame(updateSpotlight);
        ticking = true;
      }
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    updateSpotlight();

    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return <div className="pw-spotlight" id="spotlight" ref={ref} aria-hidden="true" />;
}
