"use client";

import { useState, useEffect } from "react";
import Button from "@/components/shared/Button";
import { PACK_PRICING } from "@/components/shared/CreditPackPicker";
import type { PackCode } from "@/components/shared/CreditPackPicker";

type PollState = "polling" | "confirmed" | "timeout";

interface SuccessViewProps {
  type: string | undefined;
  pack: string | undefined;
}

function creditAmount(pack: string | undefined): number | null {
  if (pack !== "s" && pack !== "m" && pack !== "l") return null;
  return PACK_PRICING.find((p) => p.code === (pack as PackCode))?.credits ?? null;
}

export default function SuccessView({ type, pack }: SuccessViewProps) {
  const isCredits = type === "credits";
  const [pollState, setPollState] = useState<PollState>(
    isCredits ? "polling" : "confirmed"
  );

  // Poll /api/credits until credits_remaining rises above the baseline captured
  // on the first tick. 15 polls × 2s = 30s max. Graceful timeout — never an error.
  useEffect(() => {
    if (!isCredits) return;
    let baseline: number | null = null;
    let polls = 0;
    const MAX_POLLS = 15;

    const id = setInterval(async () => {
      polls++;
      try {
        const res = await fetch("/api/credits");
        if (res.ok) {
          const data = (await res.json()) as { credits_remaining?: number };
          const current = data.credits_remaining ?? 0;
          if (baseline === null) {
            baseline = current;
          } else if (current > baseline) {
            clearInterval(id);
            setPollState("confirmed");
            return;
          }
        }
      } catch {
        // network blip — keep polling
      }
      if (polls >= MAX_POLLS) {
        clearInterval(id);
        setPollState("timeout");
      }
    }, 2000);

    return () => clearInterval(id);
  }, [isCredits]);

  const heading = isCredits ? "Credits added" : "Subscription active";
  const amount = isCredits ? creditAmount(pack) : null;
  const body = isCredits
    ? pollState === "polling"
      ? "Confirming your credit balance…"
      : pollState === "confirmed"
      ? amount !== null
        ? `${amount} credits have been added to your account.`
        : "Credits have been added to your account."
      : "Credits added — your balance is up to date."
    : "Your plan is active. You’re all set.";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/10">
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-accent"
          aria-hidden="true"
        >
          <path d="M20 6L9 17l-5-5" />
        </svg>
      </div>

      <div className="flex flex-col gap-1">
        <h1 className="font-display text-2xl text-text">{heading}</h1>
        <p className="text-sm text-text-muted" aria-live="polite">
          {body}
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <Button variant="primary" href="/app">
          Continue to app
        </Button>
        {pollState === "timeout" && (
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="text-sm text-text-muted underline hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-accent)]"
          >
            Refresh to check
          </button>
        )}
      </div>
    </div>
  );
}
