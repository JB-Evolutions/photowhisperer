"use client";

import { useState } from "react";
import Button from "@/components/shared/Button";
import { useResetOnBfcache } from "@/hooks/useResetOnBfcache";
import { CREDIT_PACKS, formatPrice, type CreditPackCode } from "@/lib/quota";

const PACK_CODES = Object.keys(CREDIT_PACKS) as CreditPackCode[];

function unitPrice(priceUsd: number, credits: number): string {
  return `$${(priceUsd / credits).toFixed(2)} each`;
}

interface CreditPackPickerProps {
  onCancel?: () => void;
}

export default function CreditPackPicker({ onCancel }: CreditPackPickerProps) {
  const [pending, setPending] = useState<CreditPackCode | null>(null);
  const [error, setError] = useState<string | null>(null);

  useResetOnBfcache(() => setPending(null));

  async function handleBuy(code: CreditPackCode) {
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
        setError("Couldn't start checkout. Try again.");
        setPending(null);
        return;
      }
      const data = (await res.json()) as { url?: string };
      if (!data.url) {
        setError("Couldn't start checkout. Try again.");
        setPending(null);
        return;
      }
      // Page navigates to Stripe — leave pending set so the button stays
      // in the loading state until the navigation completes.
      window.location.href = data.url;
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
      setPending(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {PACK_CODES.map((code) => {
          const pack = CREDIT_PACKS[code];
          return (
            <div
              key={code}
              className="flex flex-col justify-between gap-4 rounded-[12px] border border-border bg-surface p-5"
            >
              <div className="flex flex-col gap-0.5">
                <span className="font-mono text-[32px] font-semibold leading-none text-text">
                  {pack.credits}
                </span>
                <span className="text-xs text-text-muted">credits</span>
              </div>
              <div>
                <div className="font-mono text-xl font-medium text-text">
                  {formatPrice(pack.priceUsd)}
                </div>
                <div className="mb-3 font-mono text-xs text-text-muted">
                  {unitPrice(pack.priceUsd, pack.credits)}
                </div>
                <Button
                  variant="outline"
                  fullWidth
                  onClick={() => void handleBuy(code)}
                  pending={pending === code}
                  pendingLabel="Starting…"
                >
                  Buy
                </Button>
              </div>
            </div>
          );
        })}
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
