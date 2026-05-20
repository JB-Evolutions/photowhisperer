# Photo Whisperer — Build Steps v2

**Status:** Replaces v1 build steps PDF.
**Aligned with:** `arch-spec-v3.1.md` and `screen-spec-v1.md`.

---

## BEFORE YOU TOUCH ANY CODE — DO THESE YOURSELF

1. **System prompt finalized.** Iterated in Claude.ai until it reliably returns the three classifier response shapes. Camera profile injection needs to be added to it (see Phase 6.5 below). Test that injecting gear constraints actually changes recommendations.

2. **Supabase project created.** Magic link enabled in Auth settings. Email templates customized for verification, password reset, and magic link (point at `/auth/callback` route).

3. **Stripe products created** in test mode:
   - Portrait subscription
   - Studio subscription
   - Credit pack S (50 credits)
   - Credit pack M (200 credits)
   - Credit pack L (500 credits)

   Set metadata on each product: `app_tier: portrait` / `app_tier: studio` for subscriptions, and `credit_amount: 50` / `200` / `500` on credit packs.

4. **Screen spec finalized.** See `screen-spec-v1.md`. Read it before Phase 9.

5. **Decide credit-pack pricing.** Set the dollar amounts in Stripe before Phase 8. Suggested: $5 / $15 / $30 for 50 / 200 / 500.

---

## THE LOOP (UNCHANGED)

For every phase:

1. **[You]** Paste the relevant arch-spec + screen-spec sections into Haiku: *"What's missing or ambiguous here before I build this?"*
2. **[You]** Paste Haiku's answer + the spec sections into Opus: *"Resolve these gaps and write me a precise Claude Code prompt for this phase."*
3. **[CC]** Paste Opus's output into Claude Code.
4. **[You]** Manually test the exit criteria before moving on.

**Rule that prevents vibe coding:** if CC asks you to make a decision mid-build, stop. Resolve in Opus, then return to CC with the answer already made.

---

## THE PHASES — IN ORDER

### Phase 1 — Scaffold

Next.js 14+ App Router project. Vercel deploy. Supabase connection (anon + service-role keys). Env vars per arch spec §9. Tailwind + the design tokens from the preview HTML transplanted into CSS variables. Both dark and light themes wired with `data-theme` attribute and `localStorage` persistence.

**Exit criteria:** Empty homepage renders on Vercel with the correct dark navy background. Theme toggle works.

---

### Phase 2 — Database schema

All migrations from arch spec §2:
- `001_initial_schema.sql` — users, subscriptions, usage_tracking
- `002_quota_function.sql` — *skip; replaced in 007*
- `003_rename_tiers.sql` — tier rename if migrating existing data; otherwise skip and just use `snapshot/portrait/studio` from the start in 001
- `004_camera_profiles.sql`
- `005_sessions.sql`
- `006_credit_balances.sql`
- `007_quota_with_credits.sql`

All RLS policies as specified. The `handle_new_user` trigger creates `users`, `subscriptions` (`tier='snapshot'`), and `credit_balances` (`credits_remaining=0`) rows on signup.

**Exit criteria:** Sign up a test user via Supabase dashboard, verify all three rows are created automatically. Run `SELECT check_and_increment_quota_with_credits(user_id, MONTH, YEAR, 5);` 6 times for the test user and confirm row 6 returns `success=false`.

---

### Phase 3 — JWT middleware

`middleware.ts` enforces JWT on all `/api/*` except `/api/webhooks/*` and `/api/auth/callback`. Invalid or missing JWT returns 401 JSON.

**Exit criteria:** `curl` to `/api/settings` without auth returns 401. With a valid JWT, gets past middleware.

---

### Phase 4 — `/api/settings` stub

Build the endpoint with all validation, rate-limit check, and quota pre-check logic in place, but return a hardcoded fake response shape (one of each: ok, clarification, invalid_input, error — controllable by a query param like `?fake=ok` for testing).

Include session creation and message persistence in the handler now, even before the real classifier is wired — this catches schema issues early.

**Exit criteria:** With a valid JWT, `curl` returns each of the four shapes. Rows appear in `sessions` and `session_messages` for `ok` responses. Quota row increments.

---

### ~~Phase 5 — Cron jobs~~

**SKIPPED.** No server-side sessions in agent layer; no cleanup needed.

---

### Phase 6 — Wire real `getSettings()` + camera profile injection

Replace the fake response with the real classifier + calculator chain. Fetch `camera_profiles` for the user inside the handler and inject into the classifier prompt.

**6.5 — Update classifier prompt to use camera profile and prior_context.** The prompt now needs a section like:

```
USER'S GEAR (optional, may be absent):
Body: {body or "unknown"}
Lenses: {lenses joined by ", " or "unknown"}
Flash: {flash or "none"}

If gear is provided, constrain recommendations to what's executable on this kit.
Specifically, do not recommend apertures wider than the user's widest lens supports.
Treat unknown gear as a hint, not a constraint.

PRIOR TURN (optional, may be absent):
Previous user input: {prior_context.user_msg or "none"}
Previous scene summary: {prior_context.assistant_summary or "none"}

If prior turn is present, the new user input is a refinement or clarification.
Maintain consistency with the prior scene unless the user explicitly overrides.
```

Add to the orchestrator response validation: ensure the new prompt structure doesn't break the existing 21 calculator tests. Run the test suite.

**Exit criteria:** Real requests return real settings. A request with a camera profile constraining max aperture to f/5.6 should never return f/2.8 in the response. A refinement request with `prior_context` should produce a coherent follow-up.

---

### Phase 7 — Quota enforcement with extra credits

Wire `check_and_increment_quota_with_credits()` into the handler. Pre-check by simulating: query `usage_tracking` and `credit_balances`, decide whether to allow. The atomic function is called only after `getSettings()` returns ok. Return 429 with a body explaining the state.

Add the `credits_used`, `monthly_count`, `credits_remaining` fields to the `ok` response.

**Exit criteria:** A Snapshot user can make 5 requests, then is blocked. Grant 10 extra credits manually; the 6th request consumes a credit. Exhaust credits; request 16 returns 429.

---

### Phase 8 — Stripe (subscriptions + credit packs)

Three areas:

**8.1 — Subscription checkout:** `POST /api/stripe/checkout/subscription` creates a Checkout session for Portrait or Studio. Customer Portal accessible via `GET /api/stripe/portal`.

**8.2 — Credit pack checkout:** `POST /api/stripe/checkout/credits` creates a one-time-payment Checkout session for pack S / M / L.

**8.3 — Webhook handler:** Handle all subscription events (per arch §6.1) and one-time payment events (per arch §6.3). Idempotency required.

**Exit criteria:** End-to-end test: subscribe to Portrait via test card, see `subscriptions.tier` update; cancel via portal, see `status` flip; buy a credit pack, see `credit_balances.credits_remaining` increment; re-trigger the same webhook event, confirm no double-credit.

---

### Phase 9 — Frontend (sub-phased)

Each sub-phase is its own Opus → CC loop. Don't try to build all of frontend in one CC session.

**9.1 — Marketing pages.** Landing, Pricing, Terms, Privacy, 404. Use the design tokens from the preview HTML. Spotlight gradient component. Per `screen-spec-v1.md` §1.

**9.2 — Auth flows.** Sign up, sign in (password + magic link), check-email interstitials, password reset request, password reset completion, email verification, `/auth/callback` handler. Per `screen-spec-v1.md` §2.

**9.3 — Onboarding.** Camera profile capture flow, skippable. Per `screen-spec-v1.md` §3.

**9.4 — App shell.** Sidebar + main chat area + theme toggle + account row. Per `screen-spec-v1.md` §4.1.

**9.5 — New scene + composer.** Empty state with chips, composer with placeholder, send action. Per `screen-spec-v1.md` §4.2.

**9.6 — Active session — response states.** This is the most complex sub-phase. Build:
- User message bubble
- AI thinking / skeleton loading state with timeout escalations
- Full AI response: 4 cubes (3 WB cube states), 3 panels (scene summary always, assumptions conditional, warnings conditional), action row (refine, copy, thumbs)
- Clarification card
- Invalid input card
- Error card with retry-without-quota-consume

Per `screen-spec-v1.md` §4.3 through §4.9.

**9.7 — Out-of-credits + soft warning.** Per `screen-spec-v1.md` §4.10. Includes per-minute rate limit state §4.11.

**9.8 — Refinement flow.** Client-side concat of prior turn into the next request's `prior_context` field. 1-turn lookback cap. Per `screen-spec-v1.md` §4.7 and arch spec §4.

**9.9 — Account / Settings page.** Tabs: Profile, Camera, Preferences, Security, Danger Zone. Per `screen-spec-v1.md` §5.1.

**9.10 — Billing page + extra credits flow.** Per `screen-spec-v1.md` §5.2 and §5.3. Stripe checkout success/cancel pages §5.4 and §5.5.

**9.11 — History sidebar.** Reads `GET /api/sessions`, respects Snapshot 3-cap with an upgrade teaser. Per `screen-spec-v1.md` §4.1 sidebar section.

**9.12 — Mobile layouts.** Sidebar drawer pattern, composer pinning, cube grid responsiveness, pricing carousel. Per `screen-spec-v1.md` §6.

**9.13 — Cosmetic polish.** Spotlight performance, reduced-motion handling, theme transitions, focus rings, keyboard navigation. The "coming soon" sidebar items per `screen-spec-v1.md` §4.1.

**Exit criteria per sub-phase:** manually walk through the screen states in the screen spec. Confirm each fires correctly. Don't move to the next sub-phase until the current one's edge cases are tested.

---

### Phase 10 — Rate limiting, logging, security headers

`@upstash/ratelimit` token bucket at 10 req/min per user. Sentry integration for both Vercel and client errors. Security headers (HSTS, CSP, X-Frame-Options, Referrer-Policy) configured in `next.config.js`. Cookie consent banner for EU traffic.

Stress-test scenarios from `screen-spec-v1.md` §8.

**Exit criteria:** Lighthouse score 90+ on landing page, no console errors on happy path through any flow, sensible Sentry errors for forced failure modes.

---

## SCOPE CHANGES FROM V1 BUILD STEPS

- Phase 2 expanded with 5 new migrations (camera_profiles, sessions, session_messages, credit_balances, new quota function).
- Phase 5 (cron) confirmed skipped.
- Phase 6 absorbs camera profile injection (was unplanned in v1).
- Phase 7 quota now includes extra credits logic.
- Phase 8 adds credit-pack checkout and webhook handling.
- Phase 9 split into 13 sub-phases. v1 build steps said "one component at a time" but didn't enumerate; this version does.
- Magic link added to Phase 9.2.

---

## WHAT GETS DEFERRED TO V1.1

- Streaming responses.
- Image upload (placeholder reserved in composer).
- Long-press on cubes for context menus.
- Thumbs-down with comment field.
- Session rename / delete (excluded per user decision).
- Share / export response (excluded per user decision).
- Multi-turn deeper than 1-turn lookback.
- Public API access.
- Mobile native app.
