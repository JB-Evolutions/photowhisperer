"use client";

import { useState } from "react";
import Button from "@/components/shared/Button";
import { useResetOnBfcache } from "@/hooks/useResetOnBfcache";

export const PACK_PRICING = [
  { code: "s" as const, credits: 50,  price: 5  },
  { code: "m" as const, credits: 200, price: 15 },
  { code: "l" as const, credits: 500, price: 30 },
] as const;

export type PackCode = (typeof PACK_PRICING)[number]["code"];

interface CreditPackPickerProps {
  onCancel?: () => void;
}

export default function CreditPackPicker({ onCancel }: CreditPackPickerProps) {
  const [pending, setPending] = useState<PackCode | null>(null);
  const [error, setError] = useState<string | null>(null);

  useResetOnBfcache(() => setPending(null));

  async function handleBuy(code: PackCode) {
    // No-op if another pack is already being checked out.
    if (pending) return;
    setPending(code);
    setError(null);
    try {
      const res = await fetch("/api/stripe/checkout/credits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pack: code }),
      });
      if (!res.ok) {
        setError("Couldn't start checkout — try again.");
        setPending(null);
        return;
      }
      const data = (await res.json()) as { url?: string };
      if (!data.url) {
        setError("Couldn't start checkout — try again.");
        setPending(null);
        return;
      }
      // Page navigates to Stripe — leave pending set so the button stays
      // in the loading state until the navigation completes.
      window.location.href = data.url;
    } catch {
      setError("Couldn't reach the server — check your connection and try again.");
      setPending(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {PACK_PRICING.map((pack) => (
          <div
            key={pack.code}
            className="flex flex-col justify-between gap-4 rounded-[12px] border border-border bg-surface p-5"
          >
            <div className="flex flex-col gap-0.5">
              <span className="font-mono text-[32px] font-semibold leading-none text-text">
                {pack.credits}
              </span>
              <span className="text-xs text-text-muted">credits</span>
            </div>
            <div>
              <div className="mb-3 font-mono text-xl font-medium text-text">
                ${pack.price}
              </div>
              <Button
                variant="outline"
                fullWidth
                onClick={() => void handleBuy(pack.code)}
                pending={pending === pack.code}
                pendingLabel="Starting…"
              >
                Buy
              </Button>
            </div>
          </div>
        ))}
      </div>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <p className="text-xs text-text-dim">
        Credits don&rsquo;t expire and are used after your monthly quota.
      </p>
      {onCancel && (
        <div className="flex justify-end">
          <Button variant="ghost" onClick={onCancel}>
            Close
          </Button>
        </div>
      )}
    </div>
  );
}
