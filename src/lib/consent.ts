// Cookie-consent state, kept framework-agnostic so it's unit-testable without
// a DOM renderer. Persisted to localStorage (not a cookie) per GDPR guidance —
// the choice itself shouldn't require consent to store.
export const CONSENT_STORAGE_KEY = "pw_cookie_consent";

// Dispatched by the marketing footer's "Cookie settings" link to reopen the
// banner after a choice has already been made (GDPR requires withdrawable consent).
export const COOKIE_SETTINGS_EVENT = "pw:open-cookie-settings";

export type ConsentChoice = "granted" | "denied";

export function readConsentChoice(): ConsentChoice | null {
  if (typeof localStorage === "undefined") return null;
  const stored = localStorage.getItem(CONSENT_STORAGE_KEY);
  return stored === "granted" || stored === "denied" ? stored : null;
}

export function writeConsentChoice(choice: ConsentChoice): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(CONSENT_STORAGE_KEY, choice);
}

// Decline stays fully denied (Consent Mode still sends cookieless modeled
// pings) — there's no partial-consent tier in this product, so both branches
// map to a uniform granted/denied object.
export function consentToGtagUpdate(choice: ConsentChoice) {
  const state = choice;
  return {
    ad_storage: state,
    ad_user_data: state,
    ad_personalization: state,
    analytics_storage: state,
  } as const;
}

export function shouldLoadAnalytics(measurementId: string | undefined | null): boolean {
  return Boolean(measurementId && measurementId.trim().length > 0);
}
