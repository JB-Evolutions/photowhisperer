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

## Sentry deployed but INERT in prod — 10.2 not functionally complete

`NEXT_PUBLIC_SENTRY_DSN` is confirmed absent from the deployed Production
client bundle. `SENTRY_DSN` (server) can't be checked over HTTP — the design
silently no-ops on a missing DSN. Until both are confirmed present in
Vercel's **Production** environment scope (not just Preview/Development) and
a fresh deploy picks them up, Sentry captures nothing in prod: zero
monitoring, but also zero PII risk from the unverified scrub in the meantime.

**ORDERING CORRECTION:** the original plan said "add DSN → redeploy → then run
#11/#12." That is backwards. The moment the DSN is live, Sentry starts
capturing — and #11 is the thing that has never been verified. That would mean
turning on PII capture and *then* checking whether the PII filter works.
Invert it: verify the scrub locally against real SDK-constructed events first,
then enable in prod.

## Sentry launch-checklist items #11 and #12 — deferred, unverified

- **#11**: client-side `beforeSend` scrub firing on a real browser error has
  only been proven at the `scrubEvent`/`window`-stub level (no jsdom in this
  project) — not a full real-browser Sentry.init dry run.
- **#12**: real `captureRequestError`-driven scene detection (contexts.nextjs
  set by Sentry itself, not spoofed) for a genuine uncaught `/api/settings`
  error has not been exercised — the self-test route used a spoofed context
  via direct `captureException` instead.

**CONTRADICTION TO RESOLVE:** `src/instrumentation-client.ts` opens with a
comment claiming the *server* path is already proven end-to-end ("real
captureRequestError + fake-DSN transport capture"). That directly contradicts
the #12 entry above. There is a `scripts/e2e.ts` in the repo that may be what
proved it. One of these is wrong. Resolve before doing any #12 work — if #12
is already done, half the remaining Sentry task evaporates.

## Prod dumps a raw AuthApiError to console on invalid refresh token

An expired/invalid Supabase refresh token surfaces as a raw `AuthApiError` in
the console rather than a clean redirect to sign-in. Needs investigation —
likely a missing error-boundary or refresh-failure handler somewhere in the
auth flow.

## Local-dev rate-limiter bypass

`src/lib/rate-limit.ts` short-circuits `limitWithTimeout` when
`DISABLE_RATE_LIMIT_LOCAL=true` AND `NODE_ENV!==production`. Exists because
Auckland→us-east Upstash latency 503s block local testing past the limiter.
Prod-inert (never sets the flag + NODE_ENV guard). The flag lives only in
gitignored `.env.local`, never committed. Timeout/error path still fails
closed — this is opt-in short-circuit only.

## No post-deploy smoke test

The missing-`ANTHROPIC_API_KEY`-in-Vercel-prod incident (which broke the live
classifier) would have been caught by a single curl after deploy. There is no
such check. Process gap, not a code bug.

## DMARC record is a null

`_dmarc.mail.photographywhisperer.com` is `v=DMARC1; p=none;` with no `rua=`.
`p=none` means monitor-only (correct for now), but with no reporting address
it collects nothing — the record is a no-op. Fix at Spaceship: set value to
`v=DMARC1; p=none; rua=mailto:<an address actually read>;`. Name field is
`_dmarc.mail` (Spaceship auto-appends the domain). Keep `p=none` until the
aggregate reports come back clean; only then tighten to `quarantine`.

## Resend sending domain is on Opportunistic TLS

`mail.photographywhisperer.com` in Resend is set to Opportunistic TLS, which
sends unencrypted if the receiving server won't negotiate TLS. Auth emails
carry password-reset and magic-link tokens. Should be Enforced TLS. One
toggle in the Resend domain settings.

## Logged-in nav at 375px never visually checked

Only the logged-out state has been eyeballed at mobile width.

## OG image is a placeholder

`public/og-image.png`. Swap anytime, no code change needed.

---

## RESOLVED — delete this section after next session

- ~~`tsc --noEmit` fails on `sentry-scrub.test.ts` (4 errors)~~ — **FIXED in
  201f314.** Test referenced `Sentry.TransactionEvent`, which `@sentry/nextjs`
  stopped exporting in 10.63.0; `sentry-scrub.ts` already defined it locally
  and just needed `export`. **More importantly:** `pnpm test` now runs
  `tsc --noEmit` first. A `typecheck` script already existed in package.json
  and nobody ever ran it — that gap is why 4 errors sat on `main` unnoticed.
- ~~`onRouterTransitionStart` no-op export pending~~ — **FIXED in 201f314.**
  Build warning gone.
- ~~`pnpm add` is broken (stale foreign pnpm store)~~ — **FIXED.**
  `node_modules/.modules.yaml` was stamped with `/Users/blakebyrne/...`, a
  store that doesn't exist on this machine. `rm -rf node_modules` +
  `pnpm install --frozen-lockfile`. Verified with an add/remove round-trip.
