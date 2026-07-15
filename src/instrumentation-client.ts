// Coverage note: the client-side beforeSend scrub path is locally verified
// via scripts/sentry-client-probe.ts — real Sentry.init, real SDK event
// construction, fake-DSN local transport capture — confirmed
// user.email/ip_address and a cookie header are stripped before the
// envelope leaves the process. The server-side captureRequestError path
// (#12 in KNOWN_ISSUES.md) remains deferred per commit aaebd4e and is NOT
// proven — the self-test route used a spoofed context via direct
// captureException, not a genuine uncaught error.
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

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
