# Pre-Launch Kill-List

Items that MUST be removed or resolved before production launch. Do not ship with any
of these outstanding.

## Code removals

- **`src/app/api/settings/route.ts` — `?fake=` stub block**: Remove the entire
  `isFakeEnabled()` block and all `fake === "*"` branches (ok, clarification, invalid,
  error, rate_limited, slow, hang). Also remove `ALLOW_FAKE_SETTINGS` from `.env.local`
  and Vercel env vars. Added in Phase 9.6; rate_limited branch added in Phase 9.7.

## Vercel env vars

- **`ALLOW_TEST_LOGIN=true`** — turn OFF in Vercel production environment before launch.
  Currently `true` for dev/testing convenience; must be `false` or unset in prod.

## Data cleanup

- **Reset `jbevolutionsltd` usage_tracking row** — manually set to 4/5 and 5/5 during
  Phase 9.7 testing (soft-warning and out-of-credits render tests). Row currently
  contains fake data; reset to actual usage before launch.

## Deferred copy / review

- **Em-dash copy pass** (~25 user-facing strings across src/) — tracked in Phase 9.13.
  Full hit-list was produced in the 9.7 session.

- **Legal copy review** — `/terms` and `/privacy` pages contain placeholder legal text
  that has not been reviewed by a lawyer. Must be reviewed before launch.

- **Competing upgrade CTAs** — in the out-of-credits state a Snapshot user can see up
  to 4 simultaneous upgrade prompts: sidebar teaser, OutOfCreditsCard "Upgrade plan"
  button, SoftWarningBanner "Upgrade" link (if both fire together), and any future
  billing modal trigger. Resolve in Phase 9.11/9.13 — pick one primary CTA path.

## Account deletion (deferred from 9.9b-6 Option C)

- **Hard-delete cron sweep not implemented** — past-grace soft-deleted accounts are
  permanently blocked (proxy signs them out and redirects to `signin?account=expired`)
  but their rows are never purged. `users.deleted_at` is set; all related user data
  persists in the DB indefinitely. Before scale or GDPR hard-compliance: add a
  scheduled job that hard-deletes accounts where `deleted_at < NOW() - GRACE_PERIOD_DAYS`
  (cascade through `users`, `subscriptions`, `credit_balances`, `usage_tracking`,
  `camera_profiles`, `sessions`, `session_messages`, and the GoTrue `auth.users` row via
  Supabase Admin API). Data is inaccessible at launch, but accumulation is unbounded.

- **Stripe cancel is best-effort — no reconciliation** — if `stripe.subscriptions.cancel()`
  throws during account deletion, the soft-delete still commits and the failure is only
  logged via `console.error`. No retry, no reconciliation job. Before launch: add monitoring
  on the error log (or a periodic reconcile job) to catch orphaned active Stripe subscriptions
  on soft-deleted accounts. Low frequency, but a billing-leak risk if Stripe hiccups during
  the delete request.

## Infrastructure

- **Custom SMTP required before launch** — Supabase built-in email service hit rate limit
  during 9.9b-3 testing. Built-in service rate-limits all auth emails (signup, reset, magic
  link, email change — email change doubles volume with Secure email change ON). Before launch:
  configure custom SMTP (Resend, SendGrid, Postmark, or SES) in Supabase → Auth → SMTP Settings.
  Config only, no code changes.

## Technical debt

- **T4 classifier drift check** — verify the Anthropic model used in
  `src/app/api/settings/route.ts` is still current and the JSON schema contract hasn't
  drifted. **2026-06-28: T4 observed failure** — `orchestrate.integration.test.ts` T4
  (`"?" only`) returned `invalid_input` instead of `clarification_required`. No flakiness
  annotation exists; this is the first recorded failure. Investigate whether the model
  changed its boundary between ambiguous-input and invalid-input before launch.

- **ResetConfirmForm session check** — `src/components/auth/ResetConfirmForm.tsx` line
  27 uses `getSession()` (local cookie read, no network round-trip) rather than
  `getUser()` (authoritative server check). The in-code comment acknowledges the
  limitation. Review whether this is acceptable for the password-reset flow before
  launch.

- **Disabled coming-soon buttons not keyboard-focusable** — Profile tab ("Manage billing") and Preferences tab ("Default focal length", "Product emails") use
  the `disabled` attribute, dropping them from tab order; their "coming soon" tooltips
  are invisible to keyboard and screen-reader users. Fix in Phase 9.13: switch to
  `aria-disabled="true"` + `onClick` no-op so the buttons remain focusable.

- ~~**9.9a Security: password change DEFERRED to 9.9b**~~ — **FIXED** in 9.9b.
  Upgraded supabase-js 2.106→2.108.2 (commit `4121916`); `current_password` field
  confirmed present in `@supabase/auth-js` bundle. Password-change form built in
  SecurityTab (3-field, `type="submit"`, conservative error mapping with TODO for
  field-level routing after live test).

- **9.9b scope** — remaining: Danger Zone (export + account deletion w/ grace period).

- **9.9b-3 test 1b — in-flight email replace ("Use a different address") NOT live-verified**
  — blocked by Supabase email rate limit during testing. Logic is sound (GoTrue stores one
  pending change per user; re-submitting overwrites it) and fails gracefully if the server
  rejects it. Re-verify when rate limit resets or after custom SMTP is configured.

- ~~**Sidebar crash on session revocation**~~ — **FIXED** (commit `8c6e0e2`).
  `res.ok` guard added to both `/api/sessions` and `/api/account` fetch chains in
  `src/app/app/page.tsx`; non-ok responses set error state and return before `.json()`,
  preventing `setSessions(undefined)`. `sessions` state also gets a `?? []` fallback.
  `supabase.auth.onAuthStateChange` added in AppPage; redirects to `/auth/signin` on
  `SIGNED_OUT` only (excludes `INITIAL_SESSION`/`TOKEN_REFRESHED` so normal refresh
  does not bounce the user). Unsubscribes on effect cleanup.
