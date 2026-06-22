"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { isValidEmail, PASSWORD_MIN_LENGTH } from "@/lib/auth-validation";
import EmailField from "@/components/auth/EmailField";
import PasswordField from "@/components/auth/PasswordField";
import OrDivider from "@/components/auth/OrDivider";
import Button from "@/components/shared/Button";

export default function SignupForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showReferral, setShowReferral] = useState(false);
  const [referralCode, setReferralCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [magicPending, setMagicPending] = useState(false);

  const canSubmit = isValidEmail(email) && password.length >= PASSWORD_MIN_LENGTH;

  async function handleSubmit(formEvent: React.FormEvent) {
    formEvent.preventDefault();
    if (!canSubmit || pending) return;
    setPending(true);
    setError(null);

    const supabase = createClient();
    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        data: referralCode ? { referral_code: referralCode } : undefined,
      },
    });

    if (signUpError) {
      if (signUpError.code === "user_already_exists") {
        setError("already_registered");
      } else if (
        signUpError.code === "over_email_send_rate_limit" ||
        signUpError.code === "over_request_rate_limit"
      ) {
        setError("Too many signup attempts. Try again in a few minutes.");
      } else {
        setError("Something went wrong. Please try again.");
      }
      setPending(false);
      return;
    }

    // Supabase returns 200 with an obfuscated user (empty identities) instead of
    // an error when "Confirm email" is on and the address is already registered.
    if (data.user && data.user.identities && data.user.identities.length === 0) {
      setError("already_registered");
      setPending(false);
      return;
    }

    router.push(`/auth/verify-email?email=${encodeURIComponent(email)}`);
  }

  async function handleMagicLink() {
    if (!isValidEmail(email) || magicPending) return;
    setMagicPending(true);
    setError(null);

    const supabase = createClient();
    const { error: otpError } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });

    setMagicPending(false);
    if (otpError) {
      setError("Something went wrong. Please try again.");
      return;
    }
    router.push(`/auth/check-email?email=${encodeURIComponent(email)}`);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <EmailField value={email} onChange={setEmail} />
      <PasswordField value={password} onChange={setPassword} showStrengthMeter />

      <div>
        {!showReferral ? (
          <button
            type="button"
            onClick={() => setShowReferral(true)}
            className="text-sm text-text-muted underline hover:text-text"
          >
            Have a referral or promo code?
          </button>
        ) : (
          <div className="flex flex-col gap-1.5">
            <label htmlFor="referral" className="text-sm font-medium text-text-muted">
              Referral or promo code
            </label>
            <input
              id="referral"
              value={referralCode}
              onChange={(event) => setReferralCode(event.target.value)}
              className="min-h-[52px] rounded-[10px] border border-border-strong bg-surface px-4 text-base text-text outline-none transition-colors focus:border-accent"
            />
          </div>
        )}
      </div>

      {error === "already_registered" ? (
        <p className="text-sm text-danger">
          An account already uses that email.{" "}
          <Link href="/auth/signin" className="underline hover:text-text">
            Sign in instead
          </Link>
        </p>
      ) : (
        error && <p className="text-sm text-danger">{error}</p>
      )}

      <Button type="submit" fullWidth pending={pending} pendingLabel="Creating account…" disabled={!canSubmit}>
        Create account
      </Button>

      <OrDivider />

      <Button
        type="button"
        variant="outline"
        fullWidth
        pending={magicPending}
        pendingLabel="Sending link…"
        disabled={!isValidEmail(email)}
        onClick={handleMagicLink}
      >
        Email me a sign-in link
      </Button>

      <p className="text-center text-sm text-text-dim">
        By signing up you agree to our{" "}
        <Link href="/terms" className="underline hover:text-text">
          Terms
        </Link>{" "}
        and{" "}
        <Link href="/privacy" className="underline hover:text-text">
          Privacy
        </Link>
      </p>
    </form>
  );
}
