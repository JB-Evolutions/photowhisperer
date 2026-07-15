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

## Sentry launch-checklist items #11 and #12

- **#11 — VERIFIED IN PROD.** A real uncaught error on `/app` was delivered
  to sentry.io; the stored event was inspected directly and confirmed absent:
  error message (scene-route-omitted), breadcrumbs, breadcrumb arguments,
  request headers, cookie, authorization, email, and ip_address.
  `infer_ip=never` confirmed on the stored event — raw IP is not stored.
  Client-side `beforeSend` scrub is now proven end-to-end against a genuine
  browser error, not just the local `scrubEvent`/probe level.
- **#12**: remains deferred/unverified per commit `aaebd4e` — not touched
  this session. Real `captureRequestError`-driven scene detection
  (contexts.nextjs set by Sentry itself, not spoofed) for a genuine uncaught
  `/api/settings` error has not been exercised.

## Sentry stamps IP-derived city-level geo at ingest

`event.user.geo` (`country_code`/`city`/`subdivision`/`region`, e.g.
Auckland NZ) is added server-side by Sentry AFTER the client's `beforeSend`
scrub runs — the client scrub cannot reach it by construction: nothing in
this app populates or sees geo pre-ingest, it's stamped from the ingesting
connection's IP on Sentry's side.

Attempted and FAILED to remove it:
- (a) project's "Prevent Storing of IP Addresses" toggle
- (b) project-scope Advanced Data Scrubbing rule: `$user.geo` Remove
- (c) org-scope Advanced Data Scrubbing rule + `$user.geo.**` wildcard

Geo persisted through all three — enrichment on this plan appears not
governed by the scrubbing-rules UI.

Risk: LOW. City-level only, no identity attached (no user id/email/name on
these events), raw IP not stored (`infer_ip=never` confirmed) — same
granularity as standard analytics/CDN logs.

Not blocking; accepted for v1. If tightening is ever required (e.g. EU users
+ compliance review): open a Sentry support ticket for Relay-level geo
suppression.

## scrubEvent does not cover event.user / event.tags — latent PII leak

The canary probe confirmed scrubEvent (src/lib/sentry-scrub.ts) does NOT scrub
event.user or event.tags. An SDK-constructed event with PII in those fields
passes through uncaught.

Not firing in prod today: grep of src/ shows zero Sentry.setUser/setTag/
scope.setUser/scope.setTag calls, so nothing currently populates those
fields.

The moment anyone adds a setUser/setTag call, this leaks PII to Sentry. It is
a real coverage hole, not a hypothetical.

Fix: extend scrubEvent to strip/redact event.user (keep id if needed, drop
email/ip_address/username) and scan event.tags values against the same PII
patterns used elsewhere in the scrub. Add a unit fixture covering both
fields.

Do NOT weaken existing scrub behavior. Do NOT add setUser/setTag anywhere to
"fix" this — the scrub is the fix.

## sessions routes handle scene content but are outside the scrub's scene-route allowlist

`src/app/api/sessions/route.ts` and `src/app/api/sessions/[id]/route.ts` read
and return `session_messages.content` (raw scene text) — the same content
class the scene-route redaction in `sentry-scrub.ts` exists to protect. But
`isSceneRoutePathname` only matches `/api/settings` and `/app*`; these two
routes aren't in the allowlist.

Not a live bug today: audited every `throw`/re-throw and `console.error`/
`console.log` on these routes — all of them surface only opaque Postgrest
error metadata (`message`/`details`/`hint`/`code`) or `user_id`, never row
content. Nothing currently echoes `session_messages.content` into an error
message or breadcrumb.

The gap: if a future error path on either route ever logs or throws with row
content included, it falls through to `redactAndTruncate`'s secret-token
regex only (catches `sk_live_`/`sb_secret_`/etc. shapes) — not the wholesale
scene-route redaction that `/api/settings` and `/app` get. A generic scene
description matches no secret pattern and would ship close to verbatim
(truncated at 200 chars).

Fix-when-touched: add `/api/sessions` and `/api/sessions/[id]` to
`isSceneRoutePathname` before either route grows an error path that surfaces
row content.

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
