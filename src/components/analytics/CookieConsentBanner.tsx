"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Button from "@/components/shared/Button";
import {
  COOKIE_SETTINGS_EVENT,
  consentToGtagUpdate,
  readConsentChoice,
  writeConsentChoice,
  type ConsentChoice,
} from "@/lib/consent";

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

export default function CookieConsentBanner() {
  // Starts hidden on every render (server and first client paint alike) —
  // localStorage is only checked inside the effect below, after mount, so
  // server and client markup match and there's no hydration mismatch.
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (readConsentChoice() === null) setVisible(true);

    function reopen() {
      setVisible(true);
    }
    window.addEventListener(COOKIE_SETTINGS_EVENT, reopen);
    return () => window.removeEventListener(COOKIE_SETTINGS_EVENT, reopen);
  }, []);

  function choose(choice: ConsentChoice) {
    writeConsentChoice(choice);
    window.gtag?.("consent", "update", consentToGtagUpdate(choice));
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div
      role="region"
      aria-label="Cookie consent"
      className="pw-cookie-banner-in fixed inset-x-0 bottom-0 z-[100] border-t border-border bg-bg-2 px-4 py-4 sm:px-6"
    >
      <div className="mx-auto flex max-w-[1280px] flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-text-muted">
          We use cookies to understand how the site is used. You can accept or
          decline analytics.{" "}
          <Link href="/privacy" className="text-text underline hover:text-accent">
            Learn more
          </Link>
        </p>
        <div className="flex shrink-0 gap-3">
          <Button variant="outline" onClick={() => choose("denied")}>
            Decline
          </Button>
          <Button variant="primary" onClick={() => choose("granted")}>
            Accept
          </Button>
        </div>
      </div>
    </div>
  );
}
