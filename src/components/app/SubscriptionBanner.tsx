"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { TIER_DISPLAY_NAMES } from "@/lib/quota";
import { parseDbTimestamp } from "@/lib/date";
import type { Tier } from "@/lib/quota";

type BannerState = "past_due" | "ended" | null;

// Pure function, exported for unit testing without rendering.
// tier is the outer gate: snapshot (free) users never see a banner.
// A past end_date overrides status: handles incomplete_expired where
// mapSubscriptionStatus writes "past_due" but the subscription has already ended.
// end_date is stored in a bare TIMESTAMP column (UTC, Z stripped on write) —
// use parseDbTimestamp to force UTC parsing, not local time.
export function getBannerState(
  tier: Tier,
  status: "active" | "cancelled" | "past_due" | null,
  end_date: string | null
): BannerState {
  if (tier === "snapshot") return null;
  if (status === "active" || status === null) return null;
  if (end_date !== null && parseDbTimestamp(end_date) < new Date()) return "ended";
  if (status === "cancelled") return "ended";
  if (status === "past_due") return "past_due";
  return null;
}

interface SubscriptionBannerProps {
  tier: Tier;
  subscription_status: "active" | "cancelled" | "past_due" | null;
  subscription_end_date: string | null;
}

export default function SubscriptionBanner({
  tier,
  subscription_status,
  subscription_end_date,
}: SubscriptionBannerProps) {
  const router = useRouter();
  const [portalPending, setPortalPending] = useState(false);
  const [portalError, setPortalError] = useState(false);

  const state = getBannerState(tier, subscription_status, subscription_end_date);
  if (state === null) return null;

  const tierName = TIER_DISPLAY_NAMES[tier];

  async function handlePortal() {
    if (portalPending) return;
    setPortalPending(true);
    setPortalError(false);
    try {
      const res = await fetch("/api/stripe/portal");
      if (!res.ok) {
        setPortalError(true);
        setPortalPending(false);
        return;
      }
      const data = (await res.json()) as { url?: string };
      if (!data.url) {
        setPortalError(true);
        setPortalPending(false);
        return;
      }
      window.location.href = data.url;
    } catch {
      setPortalError(true);
      setPortalPending(false);
    }
  }

  if (state === "past_due") {
    return (
      <div className="mx-4 mb-2 flex items-center overflow-hidden rounded-lg border border-border-accent bg-[var(--accent-glow)] text-sm text-text">
        <div className="w-1 flex-shrink-0 self-stretch bg-[var(--warning)]" aria-hidden="true" />
        <p className="px-3 py-2">
          Payment issue — update your payment method to keep {tierName}.{" "}
          <button
            type="button"
            disabled={portalPending}
            className="underline-offset-2 hover:underline disabled:opacity-50"
            onClick={() => void handlePortal()}
          >
            {portalError
              ? "Couldn't open — try again"
              : portalPending
              ? "Opening…"
              : "Update payment"}
          </button>
          .
        </p>
      </div>
    );
  }

  // state === "ended"
  return (
    <div className="mx-4 mb-2 flex items-center rounded-lg border border-border bg-bg-2 px-3 py-2 text-sm text-text-muted">
      <p>
        Your {tierName} subscription has ended.{" "}
        <button
          type="button"
          className="underline-offset-2 hover:text-text hover:underline"
          onClick={() => router.push("/pricing")}
        >
          Resubscribe
        </button>
        .
      </p>
    </div>
  );
}
