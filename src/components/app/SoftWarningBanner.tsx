"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { CreditsModal } from "@/components/shared/CreditsModal";

interface SoftWarningBannerProps {
  monthlyUsed: number;
  monthlyLimit: number;
}

function dismissKey(): string {
  const now = new Date();
  return `pw-soft-warning-dismissed-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export default function SoftWarningBanner({ monthlyUsed, monthlyLimit }: SoftWarningBannerProps) {
  const [hydrated, setHydrated] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [showCreditsModal, setShowCreditsModal] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (typeof window !== "undefined" && window.localStorage.getItem(dismissKey())) {
      setDismissed(true);
    }
    setHydrated(true);
  }, []);

  if (!hydrated || dismissed) return null;

  function handleDismiss() {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(dismissKey(), "1");
    }
    setDismissed(true);
  }

  return (
    <div className="mx-4 mb-2 flex items-center gap-3 rounded-lg border border-border-accent bg-surface px-3 py-2 text-sm text-text-muted">
      <p className="flex-1">
        You've used {monthlyUsed} of {monthlyLimit} requests this month.{" "}
        <button
          type="button"
          className="underline-offset-2 hover:text-text hover:underline"
          onClick={() => router.push("/pricing")}
        >
          Upgrade
        </button>
        {" or "}
        <button
          type="button"
          className="underline-offset-2 hover:text-text hover:underline"
          onClick={() => setShowCreditsModal(true)}
        >
          Buy credits
        </button>
        .
      </p>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={handleDismiss}
        className="flex-shrink-0 leading-none text-text-dim hover:text-text-muted"
      >
        ×
      </button>
      {showCreditsModal && (
        <CreditsModal onClose={() => setShowCreditsModal(false)} />
      )}
    </div>
  );
}
