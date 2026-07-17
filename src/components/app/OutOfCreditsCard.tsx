"use client";

import { useState } from "react";
import { TIER_DISPLAY_NAMES, nextResetDate } from "@/lib/quota";
import type { Tier } from "@/lib/quota";
import Button from "@/components/shared/Button";
import { CreditsModal } from "@/components/shared/CreditsModal";

interface OutOfCreditsCardProps {
  tier: Tier;
  monthlyLimit: number;
}

export default function OutOfCreditsCard({ tier, monthlyLimit }: OutOfCreditsCardProps) {
  const [showCreditsModal, setShowCreditsModal] = useState(false);
  const isSnapshot = tier === "snapshot";

  const heading = isSnapshot
    ? "That's your free trial"
    : "You've hit your monthly limit";

  const body = isSnapshot
    ? "You've used 5 of 5 Snapshot requests, and you have no extra credits. Pick up where you left off with a credit pack, or upgrade to Portrait for 500 requests/month."
    : `You've used ${monthlyLimit} of ${monthlyLimit} ${TIER_DISPLAY_NAMES[tier]} requests this month. Your limit resets ${nextResetDate()}. Buy a credit pack to keep going now, or manage your plan.`;

  return (
    <div className="rounded-xl border border-warning bg-surface p-4">
      <div className="mb-3 flex items-center gap-2">
        <svg
          viewBox="0 0 24 24"
          width="20"
          height="20"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className="flex-shrink-0 text-warning"
        >
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
        <h2 className="font-display text-2xl text-text">{heading}</h2>
      </div>
      <p className="mb-4 text-[15px] leading-relaxed text-text-muted">{body}</p>
      <div className="flex flex-col gap-2 md:flex-row">
        <Button
          variant="primary"
          className="w-full justify-center md:w-auto"
          onClick={() => setShowCreditsModal(true)}
        >
          Buy extra credits
        </Button>
        <Button
          variant="outline"
          className="w-full justify-center md:w-auto"
          href="/pricing"
        >
          Upgrade plan
        </Button>
      </div>
      {showCreditsModal && (
        <CreditsModal onClose={() => setShowCreditsModal(false)} />
      )}
    </div>
  );
}
