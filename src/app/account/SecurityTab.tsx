"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import Button from "@/components/shared/Button";

// ─── SignOutConfirm ──────────────────────────────────────────────────────────

function SignOutConfirm({
  onConfirm,
  onCancel,
  pending,
}: {
  onConfirm: () => void;
  onCancel: () => void;
  pending: boolean;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => { dialogRef.current?.focus(); }, []);

  // Escape dismisses; Tab/Shift+Tab trapped within dialog.
  // Mirrors the pattern in MobileDrawer.tsx and DirtyGuard.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") { if (!pending) onCancel(); return; }
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
  }, [onCancel, pending]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="signout-confirm-heading"
        tabIndex={-1}
        className="w-full max-w-sm rounded-[16px] border border-border bg-surface p-6 shadow-xl outline-none"
      >
        <h2 id="signout-confirm-heading" className="font-display text-lg text-text">
          Sign out of all devices?
        </h2>
        <p className="mt-2 text-sm text-text-muted">
          This ends every active session, including this one. You&rsquo;ll need to
          sign in again on each device.
        </p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={onCancel} disabled={pending}>
            Cancel
          </Button>
          <Button
            variant="outline"
            onClick={onConfirm}
            pending={pending}
            pendingLabel="Signing out…"
          >
            Sign out everywhere
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── SecurityTab ─────────────────────────────────────────────────────────────

export default function SecurityTab() {
  const supabase = useMemo(() => createClient(), []);

  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);
  const [signOutPending, setSignOutPending] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);

  async function handleSignOut() {
    setSignOutPending(true);
    setSignOutError(null);
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        // signOut() defaults to scope:'global' — a server error means other
        // sessions may not have been revoked. Surface it; don't falsely claim
        // success on a failed security operation.
        setSignOutError("Couldn't sign out of all sessions — try again.");
        setSignOutPending(false);
        return;
      }
    } catch {
      setSignOutError("Couldn't reach the server — check your connection and try again.");
      setSignOutPending(false);
      return;
    }
    // Redirect only on confirmed success.
    setShowSignOutConfirm(false);
    window.location.href = "/auth/signin";
  }

  return (
    <>
      {showSignOutConfirm && (
        <SignOutConfirm
          onConfirm={handleSignOut}
          onCancel={() => {
            setShowSignOutConfirm(false);
            setSignOutError(null);
          }}
          pending={signOutPending}
        />
      )}

      <div className="flex max-w-lg flex-col gap-8 px-6 py-8">
        <h2 className="font-display text-base text-text">Security</h2>

        {/* Password change — deferred to 9.9b.
            {currentPassword} is absent from the supabase-js 2.106 bundle;
            the nonce/reauthenticate flow belongs with the email-change work. */}
        <section className="flex flex-col gap-4">
          <h3 className="text-sm font-semibold text-text">Change password</h3>
          <p className="text-sm text-text-muted">
            Update the password for your account.
          </p>
          <div className="group relative self-start">
            <button
              type="button"
              disabled
              aria-describedby="change-password-tooltip"
              className="cursor-not-allowed text-sm text-accent opacity-40"
            >
              Change password
            </button>
            <div
              id="change-password-tooltip"
              role="tooltip"
              className="pointer-events-none absolute left-0 top-full z-10 mt-1.5 hidden whitespace-nowrap rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-xs text-text-muted shadow-sm group-focus-within:block group-hover:block"
            >
              Password change coming soon
            </div>
          </div>
        </section>

        {/* Global sign-out.
            signOut() confirmed to default to scope:'global' from the installed
            @supabase/supabase-js bundle — revokes all sessions server-side. */}
        <section className="flex flex-col gap-3 border-t border-border pt-6">
          <h3 className="text-sm font-semibold text-text">Sessions</h3>
          <p className="text-sm text-text-muted">
            Sign out of every device where you&rsquo;re currently signed in,
            including this one.
          </p>
          {signOutError && (
            <p role="alert" className="text-sm text-danger">{signOutError}</p>
          )}
          <div>
            <Button
              variant="outline"
              onClick={() => { setSignOutError(null); setShowSignOutConfirm(true); }}
              disabled={signOutPending}
            >
              Sign out of all devices
            </Button>
          </div>
        </section>
      </div>
    </>
  );
}
