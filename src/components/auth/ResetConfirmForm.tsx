"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { PASSWORD_MIN_LENGTH } from "@/lib/auth-validation";
import PasswordField from "@/components/auth/PasswordField";
import Button from "@/components/shared/Button";

type SessionState = "checking" | "expired" | "ready";

export default function ResetConfirmForm() {
  const router = useRouter();
  const [sessionState, setSessionState] = useState<SessionState>("checking");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [confirmTouched, setConfirmTouched] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    // getSession() reads the local session without a network round-trip. It can't
    // distinguish a recovery session from a normal one, but it's the best check
    // available client-side — see conversation note on getUser() vs getSession().
    supabase.auth.getSession().then(({ data }) => {
      setSessionState(data.session ? "ready" : "expired");
    });
  }, []);

  const passwordsMatch = confirmPassword.length === 0 || confirmPassword === password;
  const canSubmit = password.length >= PASSWORD_MIN_LENGTH && confirmPassword === password;

  async function handleSubmit(formEvent: React.FormEvent) {
    formEvent.preventDefault();
    if (!canSubmit || pending) return;
    setPending(true);
    setError(null);

    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });

    if (updateError) {
      setError("Something went wrong. Please try again.");
      setPending(false);
      return;
    }

    router.push("/app");
  }

  if (sessionState === "checking") {
    return <div className="py-12 text-center text-sm text-text-muted">Loading…</div>;
  }

  if (sessionState === "expired") {
    return (
      <div className="flex flex-col items-center gap-4 text-center">
        <h1 className="font-display text-2xl text-text">This link expired</h1>
        <Link href="/auth/reset" className="text-sm text-accent underline hover:text-text">
          Request a new one
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <h1 className="font-display text-2xl text-text">Set a new password</h1>
      <PasswordField
        id="new-password"
        label="New password"
        value={password}
        onChange={setPassword}
        showStrengthMeter
      />
      <PasswordField
        id="confirm-password"
        label="Confirm new password"
        value={confirmPassword}
        onChange={setConfirmPassword}
        onBlur={() => setConfirmTouched(true)}
        error={confirmTouched && !passwordsMatch ? "Passwords don't match" : undefined}
      />
      {error && <p className="text-sm text-danger">{error}</p>}
      <Button type="submit" fullWidth pending={pending} pendingLabel="Setting password…" disabled={!canSubmit}>
        Set new password
      </Button>
    </form>
  );
}
