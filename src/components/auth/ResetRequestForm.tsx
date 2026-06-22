"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { isValidEmail } from "@/lib/auth-validation";
import EmailField from "@/components/auth/EmailField";
import Button from "@/components/shared/Button";

export default function ResetRequestForm() {
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(formEvent: React.FormEvent) {
    formEvent.preventDefault();
    if (!isValidEmail(email) || pending) return;
    setPending(true);

    const supabase = createClient();
    // Always show the same confirmation regardless of the result — anti-enumeration
    // matters more here than surfacing the real outcome (screen-spec-v1.md §2.6).
    // The ?type=recovery marker survives Supabase's redirect (it appends its own
    // code=/token_hash= params onto this URL) so /auth/callback can tell a
    // recovery link apart from signup/magic-link callbacks that share the route.
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?type=recovery`,
    });

    setPending(false);
    setSent(true);
  }

  if (sent) {
    return (
      <div className="flex flex-col items-center gap-4 text-center">
        <h1 className="font-display text-2xl text-text">Check your email</h1>
        <p className="text-base text-text-muted">
          If an account exists for that email, we sent a reset link. The link expires in 1 hour.
        </p>
        <Link href="/auth/signin" className="text-sm text-text-muted underline hover:text-text">
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <h1 className="font-display text-2xl text-text">Reset your password</h1>
      <EmailField value={email} onChange={setEmail} />
      <Button type="submit" fullWidth pending={pending} pendingLabel="Sending…" disabled={!isValidEmail(email)}>
        Send reset link
      </Button>
      <Link href="/auth/signin" className="text-center text-sm text-text-muted underline hover:text-text">
        Back to sign in
      </Link>
    </form>
  );
}
