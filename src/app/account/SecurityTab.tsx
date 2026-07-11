"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import Button from "@/components/shared/Button";
import PasswordField from "@/components/auth/PasswordField";
import { useToastContext } from "@/components/app/useToast";
import { PASSWORD_MIN_LENGTH } from "@/lib/auth-validation";

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
  const showToast = useToastContext();

  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);
  const [signOutPending, setSignOutPending] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);

  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwPending, setPwPending] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);
  const [currentPwError, setCurrentPwError] = useState<string | null>(null);

  async function handleSignOut() {
    setSignOutPending(true);
    setSignOutError(null);
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        // signOut() defaults to scope:'global' — a server error means other
        // sessions may not have been revoked. Surface it; don't falsely claim
        // success on a failed security operation.
        setSignOutError("Couldn't sign out of all sessions. Try again.");
        setSignOutPending(false);
        return;
      }
    } catch {
      setSignOutError("Couldn't reach the server. Check your connection and try again.");
      setSignOutPending(false);
      return;
    }
    // Redirect only on confirmed success.
    setShowSignOutConfirm(false);
    window.location.href = "/auth/signin";
  }

  async function handleChangePassword() {
    if (!currentPw || newPw.length < PASSWORD_MIN_LENGTH || confirmPw !== newPw) return;
    setPwPending(true);
    setPwError(null);
    setCurrentPwError(null);
    try {
      const { error } = await supabase.auth.updateUser({
        current_password: currentPw,
        password: newPw,
      });
      if (error) {
        const msg = error.message ?? "";
        // GoTrue's PUT /user response when Secure Password Change is ON and the supplied
        // current_password is wrong (live-verified 2026-07-01, @supabase/supabase-js 2.108.2).
        // GoTrue returns the same "required" phrasing for wrong vs missing; missing is
        // impossible through our UI (submit disabled on empty currentPw). Displayed text
        // intentionally reworded — "required when setting new password" is confusing when
        // the user did enter one. If field-routing stops working after a Supabase upgrade,
        // this match string is the first thing to check.
        // Cannot catch the reuse message ("New password should be different from the old
        // password.") — entirely different string, no overlap possible.
        if (msg === "Current password required when setting new password.") {
          setCurrentPwError("Current password is incorrect.");
        } else if (error.name === "AuthRetryableFetchError") {
          // updateUser catches network/infrastructure errors internally and returns
          // them as { error } (AuthRetryableFetchError) rather than throwing —
          // our catch{} never runs for these. Covers true network failures (status 0)
          // and Cloudflare 5xx; cannot match real auth errors (those are AuthApiError).
          setPwError("Couldn't reach the server. Check your connection and try again.");
        } else {
          setPwError(msg || "Couldn't update password. Try again.");
        }
        return;
      }
    } catch {
      setPwError("Couldn't reach the server. Check your connection and try again.");
      return;
    } finally {
      setPwPending(false);
    }
    setCurrentPw("");
    setNewPw("");
    setConfirmPw("");
    showToast("Password updated");
  }

  const confirmMismatch = confirmPw.length > 0 && confirmPw !== newPw;
  const submitDisabled = !currentPw || newPw.length < PASSWORD_MIN_LENGTH || confirmPw !== newPw;

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

        <section className="flex flex-col gap-4">
          <h3 className="text-sm font-semibold text-text">Change password</h3>
          <p className="text-sm text-text-muted">Update the password for your account.</p>
          <form
            noValidate
            onSubmit={(e) => { e.preventDefault(); void handleChangePassword(); }}
            className="flex flex-col gap-4"
          >
            <PasswordField
              id="current-password"
              label="Current password"
              value={currentPw}
              onChange={(v) => { setCurrentPw(v); setCurrentPwError(null); }}
              autoComplete="current-password"
              error={currentPwError ?? undefined}
            />
            <PasswordField
              id="new-password"
              label="New password"
              value={newPw}
              onChange={setNewPw}
              autoComplete="new-password"
              showStrengthMeter
            />
            <PasswordField
              id="confirm-password"
              label="Confirm new password"
              value={confirmPw}
              onChange={setConfirmPw}
              autoComplete="new-password"
              error={confirmMismatch ? "Passwords don't match." : undefined}
            />
            {pwError && (
              <p role="alert" className="text-sm text-danger">{pwError}</p>
            )}
            <div>
              <Button
                type="submit"
                disabled={submitDisabled}
                pending={pwPending}
                pendingLabel="Saving…"
              >
                Update password
              </Button>
            </div>
          </form>
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
