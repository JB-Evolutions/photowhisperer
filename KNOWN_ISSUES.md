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
- The empty state (heading + suggestion chips) deliberately co-renders with
  `OutOfCreditsCard` when a user is out of credits — `AppShell.tsx:191`
  (`!hasThread`) and `:217` (`outOfCredits`) are independent on purpose.
  This is intentional, not a bug: the dimmed chips show a blocked user what
  the product does, which is more persuasive than blank space above a
  paywall. Verified 2026-07-24 that the chips are correctly disabled in
  this state. Do not "fix" this by hiding the empty state.

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

## scrubEvent's event.tags gap — RESOLVED (event.user was already covered)

This entry previously claimed scrubEvent (src/lib/sentry-scrub.ts) didn't
scrub event.user or event.tags. Re-verified 2026-07-24: that was only half
true. event.user was already covered — scrubUser has been called from
scrubEvent (:267-271) and scrubTransaction (:343-346) with an explicit
SAFE_USER_KEYS allowlist (id only, everything else dropped) since before
this session, and it already had test coverage
(sentry-scrub.test.ts:136-149).

event.tags was the real gap: scrubTagValues existed but had zero call
sites anywhere in the file — defined, never wired in. Fixed by calling it
from both scrubEvent and scrubTransaction, same "future sample-rate raise"
reasoning already used elsewhere in the file for scrubTransaction (see the
comment at :308-309). Test coverage added for both paths, matching the
existing user-object fixture shape.

Not firing in prod today either way: grep of src/ shows zero
Sentry.setUser/setTag/scope.setUser/scope.setTag calls. No setUser/setTag
calls were added to "fix" this — the scrub was the fix.

## sessions routes now covered by the scrub's scene-route allowlist — RESOLVED

`src/app/api/sessions/route.ts` and `src/app/api/sessions/[id]/route.ts` read
and return `session_messages.content` (raw scene text) — the same content
class the scene-route redaction in `sentry-scrub.ts` exists to protect.
`isSceneRoutePathname` previously only matched `/api/settings` and `/app*`;
these two routes weren't in the allowlist.

Fixed 2026-07-24: `isSceneRoutePathname` now also matches `/api/sessions`
(exact) and `/api/sessions/` (slash-anchored prefix, so a hypothetical
`/api/sessions-archive` still wouldn't match) — same pattern already used
for `/app`. Both routes now get the wholesale scene-route redaction
(`SCENE_MESSAGE_PLACEHOLDER` on message/exception/breadcrumb.message,
`{ omitted: true }` on breadcrumb.data) instead of falling through to
`redactAndTruncate`'s secret-token-only regex. Test coverage added:
`/api/sessions` and `/api/sessions/<id>` are recognized, `/api/sessions-archive`
correctly isn't.

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

## Smoke test coverage is narrow

`pnpm smoke` proven working against prod (exit 0), but only covers the
health endpoint and the auth-gate redirect — proves the app booted, not that
it works.

## DMARC — record exists at apex, not the mail subdomain

`_dmarc.photographywhisperer.com` = `v=DMARC1; p=none;
rua=mailto:support@photographywhisperer.com;`. No record at
`_dmarc.mail.photographywhisperer.com`. Org-level fallback means subdomain
sends are still covered, but this was never explicitly verified against
Resend's actual From: domain. Confirm which domain auth mail is sent from
before tightening p=none to quarantine. rua= updated off the personal Gmail
now that Spaceship forwarding to support@ is live and confirmed.

## RLS verified — write surface is service-role only

- Cross-user isolation verified 2026-07-24 via anon-key probe, accounts A/B.
  9 PASS, 0 FAIL, 11 INERT, 2 UNVERIFIED.
- session_messages indirect-ownership policy (EXISTS join via sessions)
  confirmed working: A read 2 own rows, 0 of B's.
- INERT results are structural: no UPDATE policy on subscriptions,
  usage_tracking, sessions, credit_balances; no DELETE policy on any table.
  Any future client-side write path to these tables will NOT be protected by
  RLS — there is no policy to enforce. Writes must stay service-role/RPC only.
- user_preferences UNVERIFIED: neither test account has a row.

## prior_context is armed only by the Refine button, not by message content

`SessionView.tsx`'s `pendingRefineContextRef` is only set inside the
`onRefine` callback (`:325-336`), which fires exclusively when the user
clicks the Refine affordance on the last `ok` response — that click also
pre-fills the composer with the literal string `"Same scene but "`. A
separate effect in `AppShell.tsx:99-102` clears the armed context the
moment the composer text no longer starts with that exact prefix. Only if
both conditions hold at the moment `send()` runs does `prior_context` get
included in the `/api/settings` body (`settingsClient.ts:13-15`, which
also requires `priorContext.assistant_summary` to be truthy).

There is no keyword or intent detection anywhere in this path. A user who
free-types a refinement-style message ("make it better", "try again but
warmer") without clicking Refine sends no `prior_context` at all — the
classifier sees that message in isolation, with no scene to refine against.
This is how the feature is built, not a crash or a data bug, but it means
free-typed refinements silently lose continuity by design.

## Clarification suppression — repeated identical question

After the invalid_input fix to the suppression directive
(`SessionView.tsx:108-113`), a third consecutive vague input no longer
produces a fabricated Scene Summary. But observed 2026-07-24: the
classifier still ignores the directive's "do not ask for further
clarification" half and returns another `clarification_required` — with
the question text verbatim identical to the one already shown. To the
user this reads as a stuck loop (same question twice in a row), even
though nothing is technically broken.

Within spec: `screen-spec-v1.md:305` only asks for a tweaked prompt and to
"accept whatever the agent returns" — it does not require the frontend to
enforce compliance. The directive is a soft nudge, not a hard override; the
classifier remains free to ask again.

Prompt-side fix deferred to v1.1. Not touching `src/api/classifierPrompt.ts`
(stable, per CLAUDE.md) as part of this fix — a durable solution likely
needs either a stronger prompt-level instruction there, or a frontend
check that detects a repeated identical question and forces a different
outcome (e.g. treat it as invalid_input client-side) rather than relying
on the classifier to comply.

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
