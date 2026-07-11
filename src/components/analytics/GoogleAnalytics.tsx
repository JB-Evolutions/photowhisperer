import Script from "next/script";
import { CONSENT_STORAGE_KEY, shouldLoadAnalytics } from "@/lib/consent";

// Plain Server Component (no "use client") — both children below are static
// markup from the server's point of view; nonce comes straight from the
// request-scoped value the root layout already reads via headers().
export default function GoogleAnalytics({ nonce }: { nonce?: string }) {
  const measurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
  if (!shouldLoadAnalytics(measurementId)) return null;

  // Canonical gtag bootstrap: consent 'default' (denied) is pushed to the
  // dataLayer before 'config', so zero tracking cookies are set until Consent
  // Mode is explicitly updated. A returning user who already granted gets
  // updated to granted here too, still before 'config'.
  const bootstrapScript = `
    window.dataLayer = window.dataLayer || [];
    function gtag(){ dataLayer.push(arguments); }
    window.gtag = gtag;
    gtag('consent', 'default', {
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
      analytics_storage: 'denied',
      wait_for_update: 500
    });
    try {
      if (localStorage.getItem(${JSON.stringify(CONSENT_STORAGE_KEY)}) === 'granted') {
        gtag('consent', 'update', {
          ad_storage: 'granted',
          ad_user_data: 'granted',
          ad_personalization: 'granted',
          analytics_storage: 'granted'
        });
      }
    } catch (e) {}
    gtag('js', new Date());
    gtag('config', ${JSON.stringify(measurementId)});
  `;

  return (
    <>
      {/*
        Plain inline <script>, NOT next/script — this lands in the initial
        server-rendered HTML and runs synchronously at parse time. That's what
        guarantees it executes BEFORE the gtag.js library below: two
        strategy="afterInteractive" Scripts have no guaranteed relative order
        from Next, but a parse-time inline script vs. a script Next injects
        post-hydration (afterInteractive, by definition) is strictly ordered.
      */}
      <script nonce={nonce} dangerouslySetInnerHTML={{ __html: bootstrapScript }} />
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${measurementId}`}
        strategy="afterInteractive"
        nonce={nonce}
      />
    </>
  );
}
