"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import TextField from "@/components/shared/TextField";
import { useToastContext } from "@/components/app/useToast";
import type { TabActions } from "./AccountSettings";

type ProfileSnapshot = {
  display_name: string;
};

type AccountData = {
  tier: string;
  display_name: string | null;
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

interface ProfileTabProps {
  email: string;
  onDirtyChange: (dirty: boolean) => void;
  registerActions: (actions: TabActions | null) => void;
}

export default function ProfileTab({ email, onDirtyChange, registerActions }: ProfileTabProps) {
  const showToast = useToastContext();

  const [fetchState, setFetchState] = useState<FetchState>({ status: "loading" });
  const [displayName, setDisplayName] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);

  const savedRef = useRef<ProfileSnapshot | null>(null);
  const saveRef = useRef<() => Promise<void>>(async () => {});
  const discardRef = useRef<() => void>(() => {});

  // ─── Load ────────────────────────────────────────────────────────────────

  const loadAccount = useCallback(async () => {
    setFetchState({ status: "loading" });
    try {
      const res = await fetch("/api/account");
      if (!res.ok) { setFetchState({ status: "error" }); return; }
      const raw = await res.json() as Record<string, unknown>;
      if (typeof raw.tier !== "string") { setFetchState({ status: "error" }); return; }
      const dn = typeof raw.display_name === "string" ? raw.display_name : "";
      savedRef.current = { display_name: dn };
      setDisplayName(dn);
      setFetchState({ status: "ok", data: { tier: raw.tier, display_name: dn || null } });
    } catch {
      setFetchState({ status: "error" });
    }
  }, []);

  useEffect(() => { loadAccount(); }, [loadAccount]);

  // ─── Dirty tracking ──────────────────────────────────────────────────────

  useEffect(() => {
    if (!savedRef.current) return;
    onDirtyChange(displayName !== savedRef.current.display_name);
  }, [displayName, onDirtyChange]);

  // ─── Save / Discard ──────────────────────────────────────────────────────
  // Assigned every render; stable wrappers registered once on mount delegate
  // to these refs — avoids stale closures on second save after tab-switch.

  saveRef.current = async () => {
    setSaveError(null);
    let res: Response;
    try {
      res = await fetch("/api/account", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ display_name: displayName.trim() || null }),
      });
    } catch {
      setSaveError("Couldn't reach the server — check your connection and try again.");
      throw new Error("network failure");
    }

    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as Record<string, unknown>;
      const msg = typeof err.message === "string" ? err.message : "Couldn't save — try again?";
      setSaveError(msg);
      throw new Error(msg);
    }

    const updated = await res.json() as { display_name: string | null };
    const dn = updated.display_name ?? "";
    savedRef.current = { display_name: dn };
    setDisplayName(dn);
    onDirtyChange(false);
    showToast("Profile saved");
  };

  discardRef.current = () => {
    if (!savedRef.current) return;
    setDisplayName(savedRef.current.display_name);
    setSaveError(null);
    onDirtyChange(false);
  };

  // Register stable wrappers once on mount; cleanup on unmount.
  useEffect(() => {
    registerActions({
      save: () => saveRef.current(),
      discard: () => discardRef.current(),
    });
    return () => registerActions(null);
  }, [registerActions]);

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="flex max-w-lg flex-col gap-8 px-6 py-8">

      {/* Profile */}
      <section className="flex flex-col gap-4">
        <h2 className="font-display text-base text-text">Profile</h2>

        {/* Display name — gated on fetchState. Field is absent on error/loading
            so the user can never save over data they haven't loaded. */}
        {fetchState.status === "loading" && (
          <div className="h-[52px] animate-pulse rounded-[10px] bg-surface-2" />
        )}
        {fetchState.status === "ok" && (
          <div className="flex flex-col gap-1.5">
            <TextField
              id="profile-display-name"
              label="Display name"
              value={displayName}
              onChange={setDisplayName}
              placeholder="How you'd like to be addressed"
              autoComplete="nickname"
            />
            {saveError && (
              <p role="alert" className="text-sm text-danger">{saveError}</p>
            )}
          </div>
        )}

        {/* Email — always available from props, not gated */}
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
            <span className="text-sm text-text-muted">Couldn&rsquo;t load profile data.</span>
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
