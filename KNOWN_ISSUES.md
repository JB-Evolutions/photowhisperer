# Known Issues

Tracked items not yet resolved, captured here so they aren't lost to session
scrollback.

## §4.10 quota_exceeded render — NOT visually confirmed

The fix (dedicated `quota_exceeded` status, `forceOutOfCredits` in
`AppShell.tsx`) is type-checked, build-clean, and server-side verified (the
`?fake=quota_exceeded_no_numbers` fixture returned the exact expected body
before being stripped). The in-browser visual check was never completed — an
auth refresh-token error interrupted the eyeball mid-session. Re-verify next
session using the local runbook (steps 2-4: happy path, quota_exceeded with
real numbers, quota_exceeded without numbers) before treating this as done.

## Quota month keying uses local time, not UTC

`src/app/api/settings/route.ts` computes the quota month/year key with
unqualified `new Date().getMonth() + 1` / `new Date().getFullYear()` (quota
preflight check and the `check_and_increment_quota_with_credits` RPC call).
Neither uses `getUTCMonth()`/`getUTCFullYear()`. On a server whose process TZ
isn't UTC, this can key `usage_tracking` to the wrong month near month
boundaries — plausible failure modes: quota resetting early/late, or a day's
requests splitting across two month rows. Confirm what TZ the deployed
runtime actually uses before assuming this is live; not fixed yet.

## Sentry launch-checklist items #11 and #12 — deferred, unverified

Per `implementation-guide.md`'s launch sanity checks:
- **#11**: client-side `beforeSend` scrub firing on a real browser error has
  only been proven at the `scrubEvent`/`window`-stub level (no jsdom in this
  project) — not a full real-browser Sentry.init dry run.
- **#12**: real `captureRequestError`-driven scene detection (contexts.nextjs
  set by Sentry itself, not spoofed) for a genuine uncaught `/api/settings`
  error has not been exercised — the self-test route used a spoofed context
  via direct `captureException` instead, deliberately, since manufacturing a
  real uncaught-throw path in the live settings route was judged not worth
  the risk.

## Prod dumps a raw AuthApiError to console on invalid refresh token

Observed during this session's local verification attempt: an expired/invalid
Supabase refresh token surfaced as a raw `AuthApiError` in the console rather
than a clean redirect to sign-in. Needs investigation — likely a missing
error-boundary or refresh-failure handler somewhere in the auth flow.

## onRouterTransitionStart no-op export — still pending

`@sentry/nextjs`'s build emits: `ACTION REQUIRED: ... export
onRouterTransitionStart ... from instrumentation-client.(js|ts)`. Harmless
given `tracesSampleRate: 0` (no navigation spans to instrument yet), but the
build warning itself hasn't been silenced. Add `export const
onRouterTransitionStart = Sentry.captureRouterTransitionStart;` to
`src/instrumentation-client.ts` when tracing is turned on, or sooner if the
warning noise becomes annoying.

## Local-dev rate-limiter bypass

`src/lib/rate-limit.ts` short-circuits `limitWithTimeout` when
`DISABLE_RATE_LIMIT_LOCAL=true` AND `NODE_ENV!==production`. Exists because
Auckland→us-east Upstash latency 503s block local testing past the limiter.
Prod-inert (never sets the flag + NODE_ENV guard). The flag lives only in
gitignored `.env.local`, never committed. Timeout/error path still fails
closed — this is opt-in short-circuit only.

## Test user password needs rotation

`floppyfishfish2@gmail.com`'s password was typed directly into several `curl`
commands and Node scripts during this session's diagnostics (Upstash/rate-
limiter testing, prod auth reproduction). It's in shell history on this
machine. Rotate it before this test account is used for anything beyond
throwaway local/dev testing.
