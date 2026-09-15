"use client";

// Full-size view of a photo from the thread. Dismisses on backdrop tap,
// swipe-down, Escape and the close button; focus returns to the opener.
import { useEffect, useRef } from "react";

const SWIPE_CLOSE_PX = 80;

interface PhotoOverlayProps {
  src: string;
  alt: string;
  onClose: () => void;
}

export default function PhotoOverlay({ src, alt, onClose }: PhotoOverlayProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const gestureRef = useRef<{ startY: number; dy: number } | null>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    function onKey(e: globalThis.KeyboardEvent) {
      if (e.key === "Escape") onCloseRef.current();
    }
    document.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      opener?.focus();
    };
  }, []);

  function setImageOffset(dy: number) {
    if (imageRef.current) imageRef.current.style.transform = dy > 0 ? `translateY(${dy}px)` : "";
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={alt}
      className="fixed inset-0 z-50 flex items-center justify-center bg-bg/90 px-4 pt-[max(4rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        // Single focusable control — keep focus inside the dialog.
        if (e.key === "Tab") {
          e.preventDefault();
          closeRef.current?.focus();
        }
      }}
      onTouchStart={(e) => {
        gestureRef.current = { startY: e.touches[0].clientY, dy: 0 };
      }}
      onTouchMove={(e) => {
        const g = gestureRef.current;
        if (!g) return;
        g.dy = Math.max(0, e.touches[0].clientY - g.startY);
        setImageOffset(g.dy);
      }}
      onTouchEnd={() => {
        const g = gestureRef.current;
        gestureRef.current = null;
        if (g && g.dy > SWIPE_CLOSE_PX) {
          onClose();
          return;
        }
        setImageOffset(0);
      }}
    >
      <button
        ref={closeRef}
        type="button"
        aria-label="Close photo"
        onClick={onClose}
        className="absolute right-3 top-[max(0.75rem,env(safe-area-inset-top))] flex h-11 w-11 items-center justify-center rounded-full border border-border bg-surface text-text transition-colors duration-200 hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-accent)]"
      >
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element -- data: URI, not an optimisable asset */}
      <img ref={imageRef} src={src} alt={alt} className="max-h-full max-w-full rounded-[12px] object-contain" />
    </div>
  );
}
