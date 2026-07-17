"use client";

import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import TextField from "@/components/shared/TextField";
import { useToastContext } from "@/components/app/useToast";
import { createClient } from "@/lib/supabase/client";
import { isValidEmail } from "@/lib/auth-validation";
import Button from "@/components/shared/Button";
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

// ─── ChangeEmailModal ─────────────────────────────────────────────────────────

function ChangeEmailModal({
  currentEmail,
  onClose,
  onSuccess,
}: {
  currentEmail: string;
  onClose: () => void;
  onSuccess: (newEmail: string) => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const dialogRef = useRef<HTMLDivElement>(null);
  const [newEmail, setNewEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => { dialogRef.current?.focus(); }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") { if (!pending) onClose(); return; }
      if (e.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus(); }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose, pending]);

  function validate(value: string): string | null {
    if (!isValidEmail(value)) return "Enter a valid email address.";
    if (value.toLowerCase() === currentEmail.toLowerCase()) return "That's already your email address.";
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const err = validate(newEmail);
    if (err) { setEmailError(err); return; }
    setPending(true);
    setSubmitError(null);
    try {
      const { data, error } = await supabase.auth.updateUser({ email: newEmail });
      if (error) {
        if (error.name === "AuthRetryableFetchError") {
          setSubmitError("Couldn't reach the server. Check your connection and try again.");
        } else if (error.message === "A user with this email address has already been registered") {
          // Exact match — live-verified 2026-07-01, @supabase/supabase-js 2.108.2.
          // If field-routing stops working after a Supabase upgrade, this string is the
          // first thing to check. Degrades gracefully to the general area if it changes.
          setEmailError("That email is already in use.");
        } else {
          setSubmitError(error.message ?? "Couldn't update email. Try again.");
        }
        return;
      }
      onSuccess(data.user?.new_email ?? newEmail);
    } catch {
      setSubmitError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  const submitDisabled =
    !isValidEmail(newEmail) || newEmail.toLowerCase() === currentEmail.toLowerCase();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="change-email-heading"
        tabIndex={-1}
        className="w-full max-w-sm rounded-[16px] border border-border bg-surface p-6 shadow-xl outline-none"
      >
        <h2 id="change-email-heading" className="font-display text-lg text-text">
          Change email address
        </h2>
        <form noValidate onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="new-email" className="text-sm font-medium text-text-muted">
              New email address
            </label>
            <input
              id="new-email"
              type="email"
              autoComplete="email"
              value={newEmail}
              onChange={(e) => { setNewEmail(e.target.value); setEmailError(null); setSubmitError(null); }}
              onBlur={() => { if (newEmail) setEmailError(validate(newEmail)); }}
              aria-invalid={emailError ? true : undefined}
              aria-describedby={emailError ? "new-email-error" : undefined}
              className={`min-h-[52px] w-full rounded-[10px] border bg-surface px-4 text-base text-text outline-none transition-colors focus:border-accent ${
                emailError ? "border-danger" : "border-border-strong"
              }`}
            />
            {emailError && (
              <p id="new-email-error" className="text-sm text-danger">{emailError}</p>
            )}
          </div>
          {submitError && (
            <p role="alert" className="text-sm text-danger">{submitError}</p>
          )}
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button variant="ghost" type="button" onClick={onClose} disabled={pending}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={submitDisabled}
              pending={pending}
              pendingLabel="Sending…"
            >
              Send confirmation
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── ProfileTab ───────────────────────────────────────────────────────────────

interface ProfileTabProps {
  email: string;
  newEmail: string | null;
  onDirtyChange: (dirty: boolean) => void;
  registerActions: (actions: TabActions | null) => void;
}

export default function ProfileTab({ email, newEmail, onDirtyChange, registerActions }: ProfileTabProps) {
  const showToast = useToastContext();
  const router = useRouter();

  const [fetchState, setFetchState] = useState<FetchState>({ status: "loading" });
  const [displayName, setDisplayName] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);

  const [pendingNewEmail, setPendingNewEmail] = useState<string | null>(newEmail);
  const [showEmailModal, setShowEmailModal] = useState(false);

  const [portalPending, setPortalPending] = useState(false);
  const [billingError, setBillingError] = useState<string | null>(null);

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

  // Sync pendingNewEmail when the server re-renders with an updated newEmail prop
  // (e.g. after confirmation completes or the pending change expires).
  // No conflict with handleEmailChangeSuccess: local state and prop agree on the
  // new address; when the change is confirmed the server sends newEmail=null and
  // this clears the banner.
  useEffect(() => { setPendingNewEmail(newEmail); }, [newEmail]);

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
      setSaveError("Couldn't reach the server. Check your connection and try again.");
      throw new Error("network failure");
    }

    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as Record<string, unknown>;
      const msg = typeof err.message === "string" ? err.message : "Couldn't save. Try again?";
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

  useEffect(() => {
    registerActions({
      save: () => saveRef.current(),
      discard: () => discardRef.current(),
    });
    return () => registerActions(null);
  }, [registerActions]);

  // ─── Email change ─────────────────────────────────────────────────────────

  function handleEmailChangeSuccess(returnedNewEmail: string) {
    setPendingNewEmail(returnedNewEmail);
    setShowEmailModal(false);
    showToast("Confirmation sent. Check your email.");
  }

  // ─── Manage billing ────────────────────────────────────────────────────────
  // Mirrors BillingView.tsx handlePortal. Snapshot users have no Stripe
  // customer yet, so route them to /pricing instead of calling the portal.

  async function handleManageBilling(tier: string) {
    if (tier === "snapshot") {
      router.push("/pricing");
      return;
    }
    if (portalPending) return;
    setPortalPending(true);
    setBillingError(null);
    try {
      const res = await fetch("/api/stripe/portal");
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
        setBillingError(body.message ?? "Couldn't open the billing portal. Try again.");
        setPortalPending(false);
        return;
      }
      const data = (await res.json()) as { url?: string };
      if (!data.url) {
        setBillingError("Couldn't open the billing portal. Try again.");
        setPortalPending(false);
        return;
      }
      window.location.href = data.url;
    } catch {
      setBillingError("Couldn't reach the server. Check your connection and try again.");
      setPortalPending(false);
    }
  }

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <>
      {showEmailModal && (
        <ChangeEmailModal
          currentEmail={email}
          onClose={() => setShowEmailModal(false)}
          onSuccess={handleEmailChangeSuccess}
        />
      )}

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

          {/* Email — always available from props, not gated on fetchState */}
          <div className="flex flex-col gap-1.5">
            <TextField id="profile-email" label="Email" value={email} readOnly />
            {pendingNewEmail ? (
              <div className="flex flex-col gap-2 rounded-[10px] border border-border bg-surface-2 px-4 py-3 text-sm">
                <p className="text-text">
                  <span className="font-medium">Email change pending.</span>{" "}
                  We sent confirmation links to{" "}
                  <span className="font-medium">{email}</span> and{" "}
                  <span className="font-medium">{pendingNewEmail}</span>. Click the link
                  in <span className="font-medium">both</span> to complete the change.
                </p>
                <p className="text-text-muted">
                  Didn&rsquo;t mean to? Just don&rsquo;t click the links. The request will
                  expire on its own.
                </p>
                <button
                  type="button"
                  onClick={() => setShowEmailModal(true)}
                  className="self-start rounded text-sm text-accent transition-colors duration-[250ms] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-accent)]"
                >
                  Use a different address
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowEmailModal(true)}
                className="self-start rounded text-sm text-accent transition-colors duration-[250ms] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-accent)]"
              >
                Edit email
              </button>
            )}
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
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center rounded-full border border-border-accent bg-surface-2 px-3 py-1 text-sm font-medium text-text">
                  {TIER_LABELS[fetchState.data.tier] ?? fetchState.data.tier}
                </span>
                <Button
                  variant="ghost"
                  onClick={() => void handleManageBilling(fetchState.data.tier)}
                  pending={portalPending}
                  pendingLabel="Opening…"
                  disabled={portalPending}
                >
                  Manage billing
                </Button>
              </div>
              {billingError && (
                <p role="alert" className="mt-2 text-xs text-danger">{billingError}</p>
              )}
            </div>
          )}
        </section>

      </div>
    </>
  );
}
