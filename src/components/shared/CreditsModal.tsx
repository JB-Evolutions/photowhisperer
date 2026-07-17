"use client";

import { useRef, useEffect } from "react";
import CreditPackPicker from "@/components/shared/CreditPackPicker";

export function CreditsModal({ onClose }: { onClose: () => void }) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => { dialogRef.current?.focus(); }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") { onClose(); return; }
      if (e.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus(); }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  function handleBackdropClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target !== e.currentTarget) return;
    // Below `sm` the wrapper is opaque bg-surface, not a visually distinct
    // backdrop (full-screen mobile layout) — only close-on-click at sm+,
    // where sm:bg-black/50 actually reads as a backdrop. Mobile keeps the
    // Close button as the only dismiss affordance.
    if (!window.matchMedia("(min-width: 640px)").matches) return;
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-surface p-6 sm:items-center sm:justify-center sm:bg-black/50 sm:p-4"
      onClick={handleBackdropClick}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="credits-modal-heading"
        tabIndex={-1}
        className="flex w-full flex-col gap-4 outline-none sm:max-w-sm sm:rounded-[16px] sm:border sm:border-border sm:bg-surface sm:p-6 sm:shadow-xl"
      >
        <div className="flex items-center justify-between">
          <h2
            id="credits-modal-heading"
            className="font-display text-lg text-text"
          >
            Buy credits
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded text-text-muted transition-colors hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-accent)]"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <CreditPackPicker onCancel={onClose} />
      </div>
    </div>
  );
}
