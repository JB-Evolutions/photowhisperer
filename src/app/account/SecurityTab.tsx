"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { PASSWORD_MIN_LENGTH } from "@/lib/auth-validation";
import TextField from "@/components/shared/TextField";
import Button from "@/components/shared/Button";
import { useToastContext } from "@/components/app/useToast";

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
  const router = useRouter();
  const showToast = useToastContext();
  // Memoized so password-typing re-renders don't create a new client each time.
  const supabase = useMemo(() => createClient(), []);

  // Password change
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [confirmTouched, setConfirmTouched] = useState(false);
  const [pwPending, setPwPending] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);

  // Sign-out
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);
  const [signOutPending, setSignOutPending] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);

  const passwordsMatch = confirmPassword.length === 0 || confirmPassword === newPassword;
  const confirmError = confirmTouched && !passwordsMatch ? "Passwords don't match" : undefined;
  const tooShort = newPassword.length > 0 && newPassword.length < PASSWORD_MIN_LENGTH;
  const newPasswordError = tooShort
    ? `Must be at least ${PASSWORD_MIN_LENGTH} characters`
    : undefined;
  const canSubmit =
    newPassword.length >= PASSWORD_MIN_LENGTH &&
    confirmPassword === newPassword &&
    !pwPending;

  async function handlePasswordChange() {
    if (!canSubmit) return;
    setPwPending(true);
    setPwError(null);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) {
        setPwError(error.message ?? "Couldn't update password — try again.");
        return;
      }
      setNewPassword("");
      setConfirmPassword("");
      setConfirmTouched(false);
      showToast("Password updated");
    } catch {
      setPwError("Couldn't reach the server — check your connection and try again.");
    } finally {
      setPwPending(false);
    }
  }

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
    router.push("/auth/signin");
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

        {/* Password change.
            No current-password field: supabase.auth.updateUser() validates
            against the active session token server-side; a UI-only
            current-password check would be spoofable and provides no real
            security. §5.1 lists it but it's theatre without server
            enforcement — omitted intentionally. */}
        <section className="flex flex-col gap-4">
          <h3 className="text-sm font-semibold text-text">Change password</h3>
          <TextField
            id="new-password"
            label="New password"
            type="password"
            value={newPassword}
            onChange={setNewPassword}
            error={newPasswordError}
            autoComplete="new-password"
          />
          <TextField
            id="confirm-password"
            label="Confirm new password"
            type="password"
            value={confirmPassword}
            onChange={(v) => { setConfirmPassword(v); setConfirmTouched(true); }}
            error={confirmError}
            autoComplete="new-password"
          />
          {pwError && (
            <p role="alert" className="text-sm text-danger">{pwError}</p>
          )}
          <Button
            variant="primary"
            onClick={handlePasswordChange}
            pending={pwPending}
            pendingLabel="Updating…"
            disabled={!canSubmit}
          >
            Update password
          </Button>
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
