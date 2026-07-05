// Coverage note: beforeSend's scrub logic is proven end-to-end for the
// server path (real captureRequestError + fake-DSN transport capture); the
// client path is proven at the scrubEvent/window.location-stub level only,
// not a full real-browser Sentry.init dry run — jsdom isn't in this project.
import * as Sentry from "@sentry/nextjs";
import { scrubEvent, scrubTransaction } from "@/lib/sentry-scrub";

// No NEXT_PUBLIC_SENTRY_DSN = silent no-op — monitoring, not a safety control.
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    sendDefaultPii: false,
    // No perf tracing in v1 — avoids spans leaking URLs/query strings.
    // Raise deliberately later if tracing is wanted.
    tracesSampleRate: 0,
    beforeSend: (event) => scrubEvent(event),
    // Guard tied to the tracesSampleRate:0 assumption above: no transaction
    // ships today, but if that's ever raised, transactions must not leak
    // unscrubbed spans/trace data the moment sampling turns on.
    beforeSendTransaction: (event) => scrubTransaction(event),
  });
}
