"use client";

import { useEffect, useState, useCallback } from "react";
import TextField from "@/components/shared/TextField";

type AccountData = {
  tier: string;
};

type FetchState =
  | { status: "loading" }
  | { status: "ok"; data: AccountData }
  | { status: "error" };

const TIER_LABELS: Record<string, string> = {
  snapshot: "Snapshot",
  portrait: "Portrait",
  studio:   "Studio",
};

export default function ProfileTab({ email }: { email: string }) {
  const [fetchState, setFetchState] = useState<FetchState>({ status: "loading" });

  const loadAccount = useCallback(async () => {
    setFetchState({ status: "loading" });
    try {
      const res = await fetch("/api/account");
      if (!res.ok) { setFetchState({ status: "error" }); return; }
      const raw = await res.json() as Record<string, unknown>;
      if (typeof raw.tier !== "string") { setFetchState({ status: "error" }); return; }
      setFetchState({ status: "ok", data: { tier: raw.tier } });
    } catch {
      setFetchState({ status: "error" });
    }
  }, []);

  useEffect(() => { loadAccount(); }, [loadAccount]);

  return (
    <div className="flex max-w-lg flex-col gap-8 px-6 py-8">

      {/* Email */}
      <section className="flex flex-col gap-4">
        <h2 className="font-display text-base text-text">Profile</h2>
        <div className="flex flex-col gap-1.5">
          <TextField id="profile-email" label="Email" value={email} readOnly />
          {/* Email change is a verified multi-step flow — deferred to 9.9b */}
          <div className="group relative self-start">
            <button
              type="button"
              disabled
              aria-describedby="edit-email-tooltip"
              className="cursor-not-allowed text-sm text-accent opacity-40"
            >
              Edit email
            </button>
            <div
              id="edit-email-tooltip"
              role="tooltip"
              className="pointer-events-none absolute left-0 top-full z-10 mt-1.5 hidden whitespace-nowrap rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-xs text-text-muted shadow-sm group-focus-within:block group-hover:block"
            >
              Email change coming soon
            </div>
          </div>
        </div>
      </section>

      {/* Plan */}
      <section className="flex flex-col gap-4">
        <h2 className="font-display text-base text-text">Plan</h2>

        {fetchState.status === "loading" && (
          <div className="h-8 w-28 animate-pulse rounded-lg bg-surface-2" />
        )}

        {fetchState.status === "error" && (
          <div className="flex items-center gap-3">
            <span className="text-sm text-text-muted">Couldn&rsquo;t load plan.</span>
            <button
              type="button"
              onClick={loadAccount}
              className="rounded text-sm text-accent transition-colors duration-[250ms] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-accent)]"
            >
              Retry
            </button>
          </div>
        )}

        {fetchState.status === "ok" && (
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center rounded-full border border-border-accent bg-surface-2 px-3 py-1 text-sm font-medium text-text">
              {TIER_LABELS[fetchState.data.tier] ?? fetchState.data.tier}
            </span>
            {/* Stripe portal is a POST — /billing page not yet built (Phase 9.11) */}
            <div className="group relative">
              <button
                type="button"
                disabled
                aria-describedby="billing-tooltip"
                className="cursor-not-allowed text-sm text-accent opacity-40"
              >
                Manage billing
              </button>
              <div
                id="billing-tooltip"
                role="tooltip"
                className="pointer-events-none absolute left-0 top-full z-10 mt-1.5 hidden whitespace-nowrap rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-xs text-text-muted shadow-sm group-focus-within:block group-hover:block"
              >
                Billing coming soon
              </div>
            </div>
          </div>
        )}
      </section>

    </div>
  );
}
