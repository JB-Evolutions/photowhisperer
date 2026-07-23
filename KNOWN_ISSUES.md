# Known Issues

Tracked items not yet resolved, captured here so they aren't lost to session
scrollback.

## §4.10 quota_exceeded render — RESOLVED

Visually confirmed in-browser (local dev, Snapshot user at 5/5):
`OutOfCreditsCard` renders with the correct Snapshot copy, sidebar shows 5/5
used.

A render race was found and fixed in the process: AppShell's
`outOfCredits && account` gate would silently swallow the card if a
`quota_exceeded` response arrived before `/api/account` resolved. Fixed
structurally by gating send on account being loaded
(`disabled={... || account == null}`), so `quota_exceeded` can no longer
arrive while `account` is null. Verified under Slow 3G throttling + hard
reload: send is blocked until account loads.

The `?fake=quota_exceeded_no_numbers` fixture referenced in earlier notes no
longer exists — the entire `?fake=` backdoor (`isFakeEnabled()` and all
fixture branches) was removed in commit `e33e0b3`. The "no numbers" variant
is not producible by the current server at all: `route.ts` types
`monthly_count`/`credits_remaining` as non-optional numbers on both
`quota_exceeded` branches, so that shape can only arise from a malformed
body, not normal control flow. The optional typing on the client
(`src/lib/settings.ts`) is defensive parsing only, not a real server-side
branch.

## Cosmetic, unreviewed — OutOfCreditsCard / sidebar usage widget

- On tall viewports there is a large vertical gap between the last response
  and the pinned `OutOfCreditsCard`; the card is pinned to the composer
  position rather than following content. Cosmetic, unreviewed.
- The `+` control beside "5 / 5 used" in the sidebar has unverified behavior
  at zero remaining credits.

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
the console rather than a clean redirect to sign-in.

Root-caused via a Node harness driving the real installed
`@supabase/auth-js@2.108.2`: `_emitInitialSession()`
(`GoTrueClient.js:3559-3578`), which runs once per `onAuthStateChange()`
registration, re-throws the error that every other internal consumer
(`_recoverAndRefresh`, `_autoRefreshTokenTick`) swallows silently, then
unconditionally `console.error`s it. Unsuppressable from app code — it's
inside an internal IIFE with no `.catch()`.

**FIXED.** The raw console dump itself is still unsuppressable (library-internal,
harmless — it's a `console.error`, not a thrown/unhandled exception), but the
app now has visibility: `src/app/app/page.tsx`'s existing `getSession()` call
captures a non-null `error` via `Sentry.captureException`, with
`extra: { error_type, status, route: "/app" }` (passes scrub — see prior
analysis on `/app` scene-route message redaction; `extra` fields survive via
`SAFE_EXTRA_KEYS`). Redirect for this case was already handled by the
existing `SIGNED_OUT` listener — no redirect logic added, no second path, no
`reason=expired`, no `sentry-scrub.ts` change.

Related but separate: see "Path B — proactive-preserve stale session" below,
which this fix does NOT cover.

## Path B — proactive-preserve stale session (bounded ~90s, accepted for v1)

When an access token is still nominally valid (inside the 90s auto-refresh
margin but not yet actually expired) and the refresh token backing it is
already dead (revoked elsewhere, already rotated by another tab), GoTrue's
`_callRefreshToken` deliberately preserves the stale session rather than
signing the user out — a real upstream design choice to avoid punishing users
for a benign transient refresh hiccup. Confirmed via harness: no `SIGNED_OUT`
fires, and — more importantly — the app's own `getSession()` call (the same
one the Path A fix reads) also returns `error: null` in this branch, because
`__loadSession`'s proactive-preserve check applies identically to every
caller, not just the internal recovery path. There is no field on the public
`getSession()`/`getUser()` result that distinguishes this from a genuinely
healthy session.

Practical impact: for up to ~90 seconds, the client believes it has a valid
session when the refresh token is actually dead. `/app`'s server-gated data
fetches are unaffected (`proxy.ts` re-validates via `getUser()` server-side
on every request regardless of client-side cache state), so this is cosmetic
staleness (e.g. the displayed email), not an authorization bypass. It
self-heals the moment the access token's real `expires_at` arrives and the
next refresh attempt takes the non-preserve branch, which — being inside the
90s margin — is bounded to that window.

Decision: accepted as-is for v1. Do not build a private-API detection
mechanism (e.g. diffing session before/after a `getSession()` call, or
patching the vendored library) to close a self-correcting ~90s window — not
worth the fragility against a condition that resolves on its own.

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
