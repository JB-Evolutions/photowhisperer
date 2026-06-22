"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { isValidEmail } from "@/lib/auth-validation";
import { useResendCooldown } from "@/lib/use-resend-cooldown";
import EmailField from "@/components/auth/EmailField";
import PasswordField from "@/components/auth/PasswordField";
import OrDivider from "@/components/auth/OrDivider";
import Button from "@/components/shared/Button";

type ErrorState = null | "invalid_credentials" | "unverified" | "locked" | "generic";

interface SigninFormProps {
  initialBanner?: string | null;
}

export default function SigninForm({ initialBanner = null }: SigninFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<ErrorState>(null);
  const [pending, setPending] = useState(false);
  const [magicPending, setMagicPending] = useState(false);
  const [resendPending, setResendPending] = useState(false);
  const [banner, setBanner] = useState(initialBanner);
  const resend = useResendCooldown(email || "signin");

  async function handleSubmit(formEvent: React.FormEvent) {
    formEvent.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

    if (signInError) {
      if (signInError.code === "email_not_confirmed") {
        setError("unverified");
      } else if (
        signInError.code === "over_request_rate_limit" ||
        signInError.code === "user_banned"
      ) {
        setError("locked");
      } else if (signInError.code === "invalid_credentials") {
        setError("invalid_credentials");
      } else {
        setError("generic");
      }
      setPending(false);
      return;
    }

    router.push("/app");
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
      setError("generic");
      return;
    }
    router.push(`/auth/check-email?email=${encodeURIComponent(email)}`);
  }

  async function handleResend() {
    if (resend.isCoolingDown || resendPending || !isValidEmail(email)) return;
    setResendPending(true);
    const supabase = createClient();
    await supabase.auth.resend({
      type: "signup",
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setResendPending(false);
    resend.start();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      {banner && (
        <div className="flex items-start justify-between gap-3 rounded-[10px] border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
          <p>{banner}</p>
          <button
            type="button"
            onClick={() => setBanner(null)}
            aria-label="Dismiss"
            className="shrink-0 text-danger hover:opacity-70"
          >
            ×
          </button>
        </div>
      )}

      <EmailField value={email} onChange={setEmail} />
      <div className="flex flex-col gap-1.5">
        <PasswordField value={password} onChange={setPassword} autoComplete="current-password" />
        <Link href="/auth/reset" className="self-end text-sm text-text-muted underline hover:text-text">
          Forgot password?
        </Link>
      </div>

      {error === "invalid_credentials" && (
        <p className="text-sm text-danger">Email or password doesn&apos;t match.</p>
      )}
      {error === "unverified" && (
        <p className="text-sm text-text-muted">
          Please verify your email first.{" "}
          <button
            type="button"
            onClick={handleResend}
            disabled={resend.isCoolingDown || resendPending}
            className="underline hover:text-text disabled:no-underline disabled:opacity-60"
          >
            {resend.label ?? "Resend link"}
          </button>
        </p>
      )}
      {error === "locked" && (
        <p className="text-sm text-danger">
          Too many attempts. Please wait a few minutes, or{" "}
          <Link href="/auth/reset" className="underline hover:text-text">
            reset your password
          </Link>
          .
        </p>
      )}
      {error === "generic" && <p className="text-sm text-danger">Something went wrong. Please try again.</p>}

      <Button type="submit" fullWidth pending={pending} pendingLabel="Signing in…">
        Sign in
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
    </form>
  );
}
