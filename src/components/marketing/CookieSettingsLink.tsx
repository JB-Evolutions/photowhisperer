"use client";

import { COOKIE_SETTINGS_EVENT } from "@/lib/consent";

const linkClass =
  "text-sm text-text-muted transition-colors duration-[250ms] ease-[cubic-bezier(0.16,1,0.3,1)] hover:text-text";

export default function CookieSettingsLink() {
  return (
    <button
      type="button"
      className={linkClass}
      onClick={() => window.dispatchEvent(new CustomEvent(COOKIE_SETTINGS_EVENT))}
    >
      Cookie settings
    </button>
  );
}
