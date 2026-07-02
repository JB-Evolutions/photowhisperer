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

  useEffect(() => {
    if (!isCredits) return;

    // expectedGrant: credits the pack should add. Used as a secondary confirmation
    // signal alongside the baseline comparison. null if pack is missing or
    // unparseable — degrades to baseline-only check in that case.
    const expectedGrant = creditAmount(pack);
    const MAX_POLLS = 15;
    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    // Confirmed if balance rose above baseline (normal case), OR rose to at least
    // baseline + expectedGrant (pack-aware stronger check). Degrades to
    // baseline-only if expectedGrant is null.
    function isGranted(current: number, baseline: number): boolean {
      if (current > baseline) return true;
      if (expectedGrant !== null && current >= baseline + expectedGrant) return true;
      return false;
    }

    async function fetchBalance(): Promise<number | null> {
      try {
        const res = await fetch("/api/credits");
        if (!res.ok) return null;
        const data = (await res.json()) as { credits_remaining?: number };
        return data.credits_remaining ?? 0;
      } catch {
        return null; // network blip
      }
    }

    async function run() {
      // Phase 1: capture pre-grant baseline immediately on mount
      const base = await fetchBalance();
      if (cancelled) return;
      const baseline = base ?? 0;

      // Phase 2: poll every 2s, MAX_POLLS ticks max (30s cap)
      if (cancelled) return;
      let polls = 0;
      intervalId = setInterval(async () => {
        polls++;
        const c = await fetchBalance();
        if (cancelled) return;
        if (c !== null && isGranted(c, baseline)) {
          clearInterval(intervalId!);
          setPollState("confirmed");
          return;
        }
        if (polls >= MAX_POLLS) {
          clearInterval(intervalId!);
          setPollState("timeout");
        }
      }, 2000);
    }

    void run();

    return () => {
      cancelled = true;
      if (intervalId !== null) clearInterval(intervalId);
    };
  }, [isCredits, pack]);

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
