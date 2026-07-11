"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import Button from "@/components/shared/Button";

interface ServiceBusyCardProps {
  retryCount?: number;
  onRetry?: () => void;
}

export default function ServiceBusyCard({
  retryCount,
  onRetry,
}: ServiceBusyCardProps) {
  const count = retryCount ?? 0;

  // Mirrors ErrorCard's breadcrumb: fires once on mount, not per retry.
  useEffect(() => {
    Sentry.addBreadcrumb({
      category: "ui",
      level: "warning",
      message: "ServiceBusyCard shown",
      data: { route: window.location.pathname },
    });
  }, []);

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="mb-3 flex items-center gap-1.5">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="flex-shrink-0 text-text-muted">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
        <span className="text-[11px] font-medium uppercase tracking-widest text-text-muted">
          The service is busy right now
        </span>
      </div>
      <p className="text-[15px] leading-relaxed text-text">
        Too many requests are coming in at once. Give it a few seconds and try again.
      </p>
      <div className="mt-3">
        {onRetry !== undefined && count < 3 ? (
          <Button
            variant="outline"
            onClick={onRetry}
            className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-accent)]"
          >
            Retry
          </Button>
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
