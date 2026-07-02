"use client";

import { useState } from "react";
import Link from "next/link";
import Button from "@/components/shared/Button";
import CreditPackPicker from "@/components/shared/CreditPackPicker";
import { TIER_DISPLAY_NAMES, TIER_PRICES_USD, nextResetDate } from "@/lib/quota";
import type { Tier } from "@/lib/quota";
import { useResetOnBfcache } from "@/hooks/useResetOnBfcache";

interface BillingViewProps {
  tier: Tier;
  monthly_used: number;
  monthly_limit: number;
  credits_remaining: number;
  total_purchased: number;
  subscription_end_date: string | null;
}

export default function BillingView({
  tier,
  monthly_used,
  monthly_limit,
  credits_remaining,
  subscription_end_date,
}: BillingViewProps) {
  const [portalPending, setPortalPending] = useState<string | null>(null);
  const [planError, setPlanError] = useState<string | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [invoiceError, setInvoiceError] = useState<string | null>(null);
  const [upgradePending, setUpgradePending] = useState(false);
  const [upgradeError, setUpgradeError] = useState<string | null>(null);

  useResetOnBfcache(() => { setPortalPending(null); setUpgradePending(false); });

  // Mirror Sidebar.tsx:55–57 EXACTLY
  const total = monthly_limit + credits_remaining;
  const used = monthly_used;
  const pct = total > 0 ? Math.min(100, (used / total) * 100) : 0;

  const isPaying = tier !== "snapshot";
  const tierLabel = TIER_DISPLAY_NAMES[tier];
  const tierPrice = TIER_PRICES_USD[tier];
  const resetDate = nextResetDate();

  const renewalDate = subscription_end_date
    ? new Date(subscription_end_date).toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : null;

  // Shared portal handler — each section passes its own error setter so errors
  // are scoped to the section that triggered them.
  async function handlePortal(
    buttonId: string,
    setError: (msg: string | null) => void
  ) {
    if (portalPending) return;
    setPortalPending(buttonId);
    setError(null);
    try {
      const res = await fetch("/api/stripe/portal");
      if (!res.ok) {
        setError("Couldn't open the billing portal — try again.");
        setPortalPending(null);
        return;
      }
      const data = (await res.json()) as { url?: string };
      if (!data.url) {
        setError("Couldn't open the billing portal — try again.");
        setPortalPending(null);
        return;
      }
      window.location.href = data.url;
    } catch {
      setError("Couldn't reach the server — check your connection and try again.");
      setPortalPending(null);
    }
  }

  // Upgrade path for authenticated Snapshot users — routes to subscription
  // checkout (not /auth/signup, which is for unauthenticated marketing visitors).
  async function handleUpgrade() {
    if (upgradePending) return;
    setUpgradePending(true);
    setUpgradeError(null);
    try {
      const res = await fetch("/api/stripe/checkout/subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier: "portrait" }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        setUpgradeError(body.message ?? "Couldn't start checkout — try again.");
        setUpgradePending(false);
        return;
      }
      const data = (await res.json()) as { url?: string };
      if (!data.url) {
        setUpgradeError("Couldn't start checkout — try again.");
        setUpgradePending(false);
        return;
      }
      window.location.href = data.url;
    } catch {
      setUpgradeError("Couldn't reach the server — check your connection and try again.");
      setUpgradePending(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-bg">

      {/* Header — mirrors AccountSettings header pattern exactly */}
      <header className="flex items-center gap-4 border-b border-border px-6 py-5">
        <Link
          href="/account"
          aria-label="Back to account settings"
          className="inline-flex items-center gap-1.5 rounded text-sm text-text-muted transition-colors duration-[250ms] hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-accent)]"
        >
          <svg
            width="16" height="16" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M19 12H5M12 5l-7 7 7 7" />
          </svg>
          Back to account
        </Link>
        <h1 className="font-display text-xl text-text">Billing</h1>
      </header>

      <main className="flex flex-1 justify-start px-6 py-8">
        <div className="flex w-full max-w-[720px] flex-col gap-6">

          {/* 1. Current plan */}
          <section className="flex flex-col gap-5 rounded-[12px] border border-border bg-surface p-6">
            <div className="flex flex-col gap-1">
              <h2 className="font-display text-2xl text-text">{tierLabel}</h2>
              {isPaying ? (
                <div className="flex items-baseline gap-1">
                  <span className="font-mono text-3xl text-text">${tierPrice}</span>
                  <span className="font-mono text-sm text-text-dim">/mo</span>
                </div>
              ) : (
                <p className="font-mono text-base text-text-dim">Free forever</p>
              )}
            </div>

            {isPaying ? (
              <p className="text-sm text-text-muted">
                {renewalDate ? (
                  <>Renews <span className="font-medium text-text">{renewalDate}</span></>
                ) : (
                  "Renewal date unavailable — check the billing portal."
                )}
              </p>
            ) : (
              <p className="text-sm text-text-muted">
                You&rsquo;re on Snapshot — free forever. Upgrade for more requests.
              </p>
            )}

            {isPaying ? (
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    onClick={() => void handlePortal("change-plan", setPlanError)}
                    pending={portalPending === "change-plan"}
                    pendingLabel="Opening…"
                  >
                    Change plan
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => void handlePortal("cancel", setPlanError)}
                    pending={portalPending === "cancel"}
                    pendingLabel="Opening…"
                  >
                    Cancel
                  </Button>
                </div>
                {planError && (
                  <p role="alert" className="text-sm text-danger">{planError}</p>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <div>
                  <Button
                    variant="primary"
                    onClick={() => void handleUpgrade()}
                    pending={upgradePending}
                    pendingLabel="Starting…"
                  >
                    Upgrade to Portrait
                  </Button>
                </div>
                {upgradeError && (
                  <p role="alert" className="text-sm text-danger">{upgradeError}</p>
                )}
              </div>
            )}
          </section>

          {/* 2. Usage */}
          <section className="flex flex-col gap-4 rounded-[12px] border border-border bg-surface p-6">
            <h2 className="text-sm font-semibold text-text">Usage this month</h2>
            <div className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between gap-4">
                <p className="font-mono text-sm">
                  <span className="text-text">{used}</span>
                  <span className="text-text-muted"> of </span>
                  <span className="text-text">{monthly_limit}</span>
                  <span className="text-text-muted"> monthly</span>
                  {credits_remaining > 0 && (
                    <>
                      <span className="text-text-muted"> + </span>
                      <span className="text-text">{credits_remaining}</span>
                      <span className="text-text-muted"> extra</span>
                    </>
                  )}
                </p>
                <p className="whitespace-nowrap font-mono text-sm text-text-muted">
                  {Math.max(0, total - used)} remaining
                </p>
              </div>
              {/* Track/fill match Sidebar.tsx:214-216; h-2 instead of h-1 per billing page spec */}
              <div className="h-2 w-full overflow-hidden rounded-full bg-surface-3">
                <div
                  className="h-full rounded-full bg-accent transition-[width]"
                  style={{ width: `${Math.max(pct, 3)}%` }}
                />
              </div>
              <p className="text-xs text-text-dim">Quota resets {resetDate}</p>
            </div>
          </section>

          {/* 3. Extra credits */}
          <section className="flex flex-col gap-4 rounded-[12px] border border-border bg-surface p-6">
            <div className="flex flex-col gap-1">
              <h2 className="text-sm font-semibold text-text">Need more requests?</h2>
              <p className="text-sm text-text-muted">
                Credit packs are added instantly and are used after your monthly quota runs out.
              </p>
            </div>
            <CreditPackPicker />
          </section>

          {/* 4. Payment method — paying tiers only */}
          {/* TODO(killlist): live card last-4 display deferred — requires stripe.paymentMethods.retrieve */}
          {isPaying && (
            <section className="flex flex-col gap-4 rounded-[12px] border border-border bg-surface p-6">
              <div className="flex flex-col gap-1">
                <h2 className="text-sm font-semibold text-text">Payment method</h2>
                <p className="text-sm text-text-muted">
                  Manage your card and billing details in the portal.
                </p>
              </div>
              <div className="flex flex-col gap-2">
                <div>
                  <Button
                    variant="outline"
                    onClick={() => void handlePortal("payment-method", setPaymentError)}
                    pending={portalPending === "payment-method"}
                    pendingLabel="Opening…"
                  >
                    Update payment method
                  </Button>
                </div>
                {paymentError && (
                  <p role="alert" className="text-sm text-danger">{paymentError}</p>
                )}
              </div>
            </section>
          )}

          {/* 5. Invoice history */}
          <section className="flex flex-col gap-4 rounded-[12px] border border-border bg-surface p-6">
            <div className="flex flex-col gap-1">
              <h2 className="text-sm font-semibold text-text">Invoices</h2>
              <p className="text-xs text-text-dim">
                Recent activity may take a few minutes to appear.
              </p>
            </div>
            {isPaying ? (
              <div className="flex flex-col gap-2">
                <p className="text-sm text-text-muted">
                  Your full invoice history and downloadable receipts are in the billing portal.
                </p>
                <div className="flex flex-col gap-2">
                  <div>
                    <Button
                      variant="outline"
                      onClick={() => void handlePortal("invoices", setInvoiceError)}
                      pending={portalPending === "invoices"}
                      pendingLabel="Opening…"
                    >
                      View invoices &amp; receipts
                    </Button>
                  </div>
                  {invoiceError && (
                    <p role="alert" className="text-sm text-danger">{invoiceError}</p>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-sm text-text-muted">No invoices yet.</p>
            )}
          </section>

        </div>
      </main>
    </div>
  );
}
