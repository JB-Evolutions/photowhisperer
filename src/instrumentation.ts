import * as Sentry from "@sentry/nextjs";
import { scrubEvent, scrubTransaction } from "@/lib/sentry-scrub";

// No SENTRY_DSN = silent no-op. This is monitoring, not a safety control —
// unlike the rate limiter's fail-loud env assertion, missing Sentry config
// must never block boot or degrade the app.
export async function register() {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;

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

export const onRequestError = Sentry.captureRequestError;
