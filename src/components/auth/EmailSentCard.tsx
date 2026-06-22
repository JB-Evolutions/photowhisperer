"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useResendCooldown } from "@/lib/use-resend-cooldown";
import Button, { buttonBase, buttonVariants, buttonSizes } from "@/components/shared/Button";

interface EmailSentCardProps {
  email: string;
  heading: string;
  body: ReactNode;
  resendType: "magiclink" | "signup";
  changeEmailHref: string;
}

export default function EmailSentCard({
  email,
  heading,
  body,
  resendType,
  changeEmailHref,
}: EmailSentCardProps) {
  const resend = useResendCooldown(email || resendType);
  const [pending, setPending] = useState(false);

  async function handleResend() {
    if (resend.isCoolingDown || pending || !email) return;
    setPending(true);

    const supabase = createClient();
    const emailRedirectTo = `${window.location.origin}/auth/callback`;
    if (resendType === "magiclink") {
      await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo } });
    } else {
      await supabase.auth.resend({ type: "signup", email, options: { emailRedirectTo } });
    }

    setPending(false);
    resend.start();
  }

  return (
    <div className="flex flex-col items-center gap-6 text-center">
      <h1 className="font-display text-2xl text-text">{heading}</h1>
      <p className="text-base text-text-muted">{body}</p>

      <Button
        type="button"
        variant="outline"
        fullWidth
        pending={pending}
        pendingLabel="Sending…"
        disabled={resend.isCoolingDown}
        onClick={handleResend}
      >
        {resend.isCoolingDown ? resend.label : "Resend email"}
      </Button>

      <Link href={changeEmailHref} className="text-sm text-text-muted underline hover:text-text">
        Change email
      </Link>

      <div className="flex w-full gap-3">
        <a
          href="https://mail.google.com/mail/u/0/#inbox"
          target="_blank"
          rel="noopener noreferrer"
          className={`${buttonBase} ${buttonVariants.ghost} ${buttonSizes.default} flex-1 justify-center`}
        >
          Open Gmail
        </a>
        <a
          href="https://outlook.live.com/mail/0/inbox"
          target="_blank"
          rel="noopener noreferrer"
          className={`${buttonBase} ${buttonVariants.ghost} ${buttonSizes.default} flex-1 justify-center`}
        >
          Open Outlook
        </a>
      </div>
    </div>
  );
}
