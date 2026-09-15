"use client";

// The settings route couldn't load the user's saved gear and refused to
// answer without it. Nothing was charged, so retry is the plain resend path.
// The button stays locked for Retry-After seconds, then unlocks.
import { useEffect, useState } from "react";
import * as Sentry from "@sentry/nextjs";
import Button from "@/components/shared/Button";

interface GearUnavailableCardProps {
  retryAfterSeconds: number;
  retryCount?: number;
  // Only the latest message gets a retry; older copies render copy alone.
  onRetry?: () => void;
}

export default function GearUnavailableCard({
  retryAfterSeconds,
  retryCount,
  onRetry,
}: GearUnavailableCardProps) {
  const count = retryCount ?? 0;
  const [remaining, setRemaining] = useState(() => Math.max(0, Math.ceil(retryAfterSeconds)));
  const waiting = remaining > 0;

  useEffect(() => {
    if (!waiting) return;
    const id = setInterval(() => {
      setRemaining((r) => (r <= 1 ? 0 : r - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [waiting]); // fires only on waiting↔ready, not every tick

  // Mirrors ServiceBusyCard's breadcrumb: once on mount, not per retry.
  useEffect(() => {
    Sentry.addBreadcrumb({
      category: "ui",
      level: "warning",
      message: "GearUnavailableCard shown",
      data: { route: window.location.pathname },
    });
  }, []);

  const canRetry = onRetry !== undefined && count < 3;

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="mb-3 flex items-center gap-1.5">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="flex-shrink-0 text-text-muted">
          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
          <circle cx="12" cy="13" r="4" />
        </svg>
        <span className="text-[11px] font-medium uppercase tracking-widest text-text-muted">
          Couldn&rsquo;t load your gear
        </span>
      </div>
      <p className="text-[15px] leading-relaxed text-text">
        Your saved gear couldn&rsquo;t be loaded, so the answer would ignore your lenses &mdash; try
        again in a moment. Nothing was used.
      </p>
      <div className="mt-3">
        {canRetry ? (
          <>
            <Button
              variant="outline"
              onClick={onRetry}
              disabled={waiting}
              className="min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-accent)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {waiting ? `Try again in ${remaining}s` : "Try again"}
            </Button>
            {/* Announce once when the lock lifts, not every tick. */}
            <p className="sr-only" aria-live="polite">
              {waiting ? "" : "You can try again now."}
            </p>
          </>
        ) : count >= 3 ? (
          <p className="text-[13px] text-text-muted">
            Still failing?{" "}
            <a
              href="mailto:support@photographywhisperer.com"
              className={[
                "text-text-muted underline underline-offset-2",
                "transition-colors duration-200 ease-[cubic-bezier(0.2,0,0,1)]",
                "hover:text-text",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-accent)]",
              ].join(" ")}
            >
              Report a problem
            </a>
          </p>
        ) : null}
      </div>
    </div>
  );
}
