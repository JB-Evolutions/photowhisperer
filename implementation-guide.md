# PhotoWhisperer — Implementation Guide

**Purpose:** For each major piece of work in the v3.1 spec, this document gives you a self-contained CC prompt template you can refine in Opus and paste into Claude Code.

**Use this with:** `arch-spec-v3.1.md`, `build-steps-v2.md`, `screen-spec-v1.md`.

**The loop (reminder):**
1. Read the implementation pack below for the piece you're building.
2. Paste the referenced spec sections + the CC prompt template into Opus and ask it to resolve any ambiguity and produce a final CC-ready prompt.
3. Paste Opus's output into Claude Code.
4. Test exit criteria.

**Note on order:** these implementation packs roughly follow the build phase order from `build-steps-v2.md` but you can use them out-of-order for refactors and bug fixes once the foundation is in place. Each pack lists its dependencies up top.

---

## PACK 1 — Database migration: tier rename, camera profile, sessions, credits

**Phase:** 2
**Depends on:** existing v3.0 schema migrations 001 + 002 (or fresh install)
**Files affected:** `supabase/migrations/003_rename_tiers.sql` through `007_quota_with_credits.sql`

**CC prompt template:**

```
Reference: arch-spec-v3.1.md §2 (Database Schema).

Create the following Supabase migrations in order under `supabase/migrations/`:

1. 003_rename_tiers.sql — rename tier enum values in subscriptions
   table from free/silver/gold to snapshot/portrait/studio. Update the
   default value. Update the handle_new_user trigger to insert 'snapshot'.
   If we are on a fresh install with no existing data, this migration can
   be a no-op SELECT 1; otherwise it must update existing rows.

2. 004_camera_profiles.sql — create camera_profiles table with the
   exact schema in arch spec §2.5, including RLS policies.

3. 005_sessions.sql — create sessions and session_messages tables with
   the exact schema in arch spec §2.6 and §2.7, including indexes and
   RLS policies. Note that session_messages RLS uses an EXISTS subquery
   against sessions.

4. 006_credit_balances.sql — create credit_balances table per arch §2.4
   including RLS. Update the handle_new_user trigger to also insert a
   row in credit_balances with credits_remaining=0.

5. 007_quota_with_credits.sql — create the function
   check_and_increment_quota_with_credits per arch §2.8 (the exact code
   is in that section, copy it verbatim — do not rewrite). Drop the
   old check_and_increment_quota function.

Constraints:
- Every migration must be idempotent or use IF NOT EXISTS / IF EXISTS
  where appropriate.
- Do not modify the existing 001 or 002 migrations.
- All timestamps default to NOW().
- All RLS must be enabled and policies created exactly as specified.

After writing the migrations, write a one-shot SQL test script that:
- Creates a test user via direct insert into auth.users (or via the
  Supabase CLI helper).
- Verifies users, subscriptions (tier=snapshot), credit_balances
  (credits=0) all auto-create.
- Calls check_and_increment_quota_with_credits 5 times for tier_limit=5.
- Verifies the 6th call returns success=false, credits_used=false.
- Manually inserts credit_balances.credits_remaining=5.
- Calls 5 more times; verifies success=true, credits_used=true.
- Calls an 11th time; verifies success=false.
```

**Exit criteria:** all six migrations apply cleanly. Test script passes. RLS verified by attempting cross-user reads (should return 0 rows).

---

## PACK 2 — JWT middleware

**Phase:** 3
**Depends on:** Phase 1 scaffold, Supabase env vars
**Files affected:** `middleware.ts`, `src/lib/supabase/server.ts`

**CC prompt template:**

```
Reference: arch-spec-v3.1.md §5.

Create a Next.js middleware.ts at the project root that enforces
Supabase JWT validation on all routes matching /api/* with these exceptions:
- /api/webhooks/* (Stripe webhooks have their own signature validation)
- /api/auth/callback (Supabase magic link callback)

On valid JWT: set the resolved user_id on the request (use Next.js
NextResponse with a header or context).
On invalid/missing JWT: return a 401 JSON response with shape
{ "error": "unauthorized" }.

Use the Supabase server client from src/lib/supabase/server.ts (create
this file if it doesn't exist). Initialize it with the SERVICE_ROLE_KEY,
not the anon key.

Do not log JWTs. Do not log full request bodies.

Write a test that:
- Calls /api/settings without auth header, expects 401.
- Calls /api/settings with a valid test JWT, gets past middleware (returns
  whatever the handler returns).
- Calls /api/webhooks/stripe with no auth, gets past middleware.
```

**Exit criteria:** middleware test passes. Manual curl verifies behavior.

---

## PACK 3 — `/api/settings` stub with session writes

**Phase:** 4
**Depends on:** Packs 1, 2
**Files affected:** `src/app/api/settings/route.ts`, `src/lib/sessions.ts`, `src/lib/quota.ts`

**CC prompt template:**

```
Reference: arch-spec-v3.1.md §1.1, §2.6, §2.7, §2.8, §7 (POST /api/settings).
Reference: screen-spec-v1.md §4 (all four response states).

Build the POST /api/settings route handler at
src/app/api/settings/route.ts. For now, return a HARDCODED fake response,
selectable via query param ?fake=ok | clarification | invalid | error.

Request validation:
- Body must be JSON with required field "conditions" (string, 1–5000 chars).
- Optional "session_id" (UUID).
- Optional "prior_context" object with { user_msg: string, assistant_summary: string }.
- Return 400 with { error: "validation", message: "..." } on failure.

Handler sequence:
1. JWT already validated by middleware; read user_id from request.
2. Per-minute rate limit check — use @upstash/ratelimit if env vars
   present, otherwise no-op for local dev.
3. Quota pre-check — call check_and_increment_quota_with_credits with
   the user's tier limit. If returns success=false, return 429 with
   { error: "quota_exceeded", monthly_count, credits_remaining }.
   Important: in this stub, treat the pre-check as authoritative since
   there is no real classifier yet — but in Phase 6, the pre-check
   becomes approximate and the post-success call is authoritative.
4. Generate a fake response based on the ?fake= param (default 'ok').
5. If status='ok', call ensureSession(user_id, session_id) which
   creates a new session if session_id is null and returns the session
   metadata. Insert user message + assistant message rows into
   session_messages. If the session has no title, generate one from
   scene_summary (truncate to 80 chars).
6. Return JSON.

Helper module src/lib/sessions.ts:
- ensureSession(user_id, session_id?) → { session_id, was_created }
- appendMessages(session_id, user_content, assistant_content) → void
- updateSessionTitle(session_id, title) → void

Helper module src/lib/quota.ts:
- getTierLimit(tier)
- getHistoryLimit(tier)
- TIER_LIMITS, TIER_DISPLAY_NAMES, TIER_PRICES_USD, TIER_HISTORY_LIMITS
  constants as in arch §3.

The four fake response shapes are in arch §7. Use them verbatim.

Write a test that hits the endpoint with each ?fake= value as an
authenticated user and asserts:
- Correct response shape.
- For ?fake=ok, sessions row created and 2 session_messages rows
  inserted.
- For ?fake=clarification|invalid|error, NO session writes.
- For ?fake=ok, usage_tracking row incremented.
- For ?fake=clarification|invalid|error, usage_tracking NOT incremented.
```

**Exit criteria:** curl with each fake type produces correct response and DB state.

---

## PACK 4 — Wire real classifier + camera profile injection

**Phase:** 6 + 6.5
**Depends on:** Pack 3, existing sealed calculator + classifier modules
**Files affected:** `src/app/api/settings/route.ts`, `src/api/classifierPrompt.ts`, `src/api/classifier.ts`, `src/lib/camera-profile.ts`

**CC prompt template:**

```
Reference: arch-spec-v3.1.md §1.1, §4 (Option C), §7.
Reference: build-steps-v2.md Phase 6.5 (classifier prompt update).

Replace the fake response in src/app/api/settings/route.ts with the
real call to getSettings(conditions, camera_profile, prior_context)
from src/api/orchestrate.ts.

1. Before calling getSettings, fetch the user's camera_profile row
   from camera_profiles. May be null. Use a helper in
   src/lib/camera-profile.ts: getCameraProfile(user_id) → { body,
   lenses, flash, notes } | null.

2. Update the orchestrator's getSettings() signature if needed to
   accept (conditions, camera_profile, prior_context) and pass these
   into callClassifier.

3. Update src/api/classifierPrompt.ts to add two new sections to the
   system prompt, exactly as specified in build-steps-v2.md Phase 6.5:
   - USER'S GEAR section (templated from camera_profile)
   - PRIOR TURN section (templated from prior_context)

   The templating should produce 'unknown' or 'none' when fields are
   absent. The prompt should explicitly instruct the model to treat
   gear as a constraint (especially aperture min) and prior turn as
   continuity context.

4. Do not change the calculator or its tests. Do not change the
   classifier's response shape contract.

5. After the orchestrator returns:
   - If status='ok', call the atomic check_and_increment_quota_with_credits.
     If it returns success=false (race), return 429.
   - Then do session writes (same as Pack 3).
   - Add credits_used, monthly_count, credits_remaining fields to
     the response.

6. Validate the orchestrator's response against the OrchestrateResult
   types before returning. On validation failure, return
   { status: 'error', message: 'Unexpected response shape' }.

Write integration tests with a real Anthropic API key (skip if env
var missing):
- Send a request with camera_profile body='Sony A6000', lens
  'Sony 18-55 f/3.5-5.6'. Assert the returned aperture is not
  wider than f/3.5.
- Send a request with prior_context referencing a previous shot.
  Assert the scene_summary acknowledges continuity.
- Send a gibberish request. Assert status='invalid_input'.
- Send "?" only. Assert status='clarification_required'.
```

**Exit criteria:** four integration tests pass against the real classifier.

---

## PACK 5 — Stripe webhooks for subscriptions + credit packs

**Phase:** 8
**Depends on:** Packs 1, 3
**Files affected:** `src/app/api/webhooks/stripe/route.ts`, `src/app/api/stripe/checkout/subscription/route.ts`, `src/app/api/stripe/checkout/credits/route.ts`, `src/app/api/stripe/portal/route.ts`, `src/lib/stripe.ts`, `src/lib/credits.ts`

**CC prompt template:**

```
Reference: arch-spec-v3.1.md §6.

Build four Stripe-related endpoints and the webhook handler.

1. POST /api/stripe/checkout/subscription
   - Auth required.
   - Body: { tier: 'portrait' | 'studio' }.
   - Look up STRIPE_PRICE_ID_PORTRAIT or _STUDIO from env.
   - Create a Stripe Checkout Session with mode='subscription',
     success_url = NEXT_PUBLIC_APP_URL + /billing/success,
     cancel_url = NEXT_PUBLIC_APP_URL + /billing/cancel.
   - Set client_reference_id = user_id.
   - Set customer_email from the authenticated user.
   - Return { url } where url is session.url.

2. POST /api/stripe/checkout/credits
   - Auth required.
   - Body: { pack: 's' | 'm' | 'l' }.
   - Look up STRIPE_PRICE_ID_CREDITS_50 / _200 / _500.
   - Create a Stripe Checkout Session with mode='payment'.
   - Include metadata: { user_id, credit_amount: <50|200|500> }.
   - Return { url }.

3. GET /api/stripe/portal
   - Auth required.
   - Find subscriptions.stripe_customer_id for the user.
   - Create a Portal Session with return_url = NEXT_PUBLIC_APP_URL + /account/billing.
   - Return { url }.

4. POST /api/webhooks/stripe
   - No auth (Stripe-signed instead).
   - Verify the Stripe signature with STRIPE_WEBHOOK_SECRET.
   - Handle these event types:
     a. customer.subscription.created — upsert subscriptions row with
        tier from product metadata (app_tier), status from event.
     b. customer.subscription.updated — update status, end_date, tier.
     c. invoice.payment_succeeded — update status='active', extend end_date.
     d. invoice.payment_failed — update status='past_due'.
     e. customer.subscription.deleted — update status='canceled', set
        end_date.
     f. checkout.session.completed with mode='payment' (one-time) and
        payment_status='paid' — read metadata.user_id and
        metadata.credit_amount, increment credit_balances atomically
        with INSERT ... ON CONFLICT DO UPDATE as in arch §6.3.

   Idempotency: maintain a stripe_events_processed table
   (event_id PK, processed_at). Check for existing event_id before
   processing; insert after. If insert fails on conflict, skip
   (already processed).

   All writes use the service-role Supabase client.

5. src/lib/stripe.ts — initialize Stripe SDK with STRIPE_SECRET_KEY.
6. src/lib/credits.ts — helper functions to read credit_balances,
   used by GET /api/credits later.

Write tests using Stripe's test fixtures:
- Subscription create event → subscriptions row created with tier
  matching event metadata.
- Same event delivered twice → second delivery is no-op.
- checkout.session.completed for credit pack → credit_balances
  incremented by the credit_amount.
- Same checkout event delivered twice → second is no-op.
```

**Exit criteria:** Stripe CLI `stripe trigger checkout.session.completed` produces the expected DB state. Subscription lifecycle test passes.

---

## PACK 6 — `/api/sessions`, `/api/sessions/:id`, `/api/camera-profile`, `/api/credits`

**Phase:** 7 (well, 6-7 ish — these are read endpoints used by frontend)
**Depends on:** Packs 1, 2
**Files affected:** several route files

**CC prompt template:**

```
Reference: arch-spec-v3.1.md §7.

Build the four read/write endpoints:

1. GET /api/sessions
   - Auth required.
   - Determine the user's tier from subscriptions table.
   - Call getHistoryLimit(tier). If -1, no cap; if 3, cap to 3.
   - Query sessions for user_id, ordered by updated_at DESC, limited
     by the cap.
   - Return { sessions: [{ session_id, title, updated_at }, ...] }.

2. GET /api/sessions/[id]
   - Auth required.
   - Verify the session belongs to the user (RLS catches this, but
     for clean 404s do an explicit ownership check too).
   - Return { session_id, title, messages: [{ message_id, role,
     content, created_at }, ...] } ordered by created_at ASC.
   - Return 404 if session not found or not owned.

3. GET /api/camera-profile
   - Auth required.
   - Return the user's camera_profile row, or null.

4. PUT /api/camera-profile
   - Auth required.
   - Body: any subset of { body, lenses, flash, notes }.
   - Upsert the user's row.
   - Return the updated profile.

5. GET /api/credits
   - Auth required.
   - Return { credits_remaining, total_purchased } from credit_balances.
     If row doesn't exist (edge case from bad migration), return
     { credits_remaining: 0, total_purchased: 0 }.

All endpoints return JSON with consistent error shapes:
{ "error": "code", "message": "human readable" }.
```

**Exit criteria:** curl each endpoint with valid auth, verify correct shapes and RLS behavior.

---

## PACK 7 — Marketing pages (landing, pricing, terms, privacy, 404)

**Phase:** 9.1
**Depends on:** Phase 1 scaffold
**Files affected:** `src/app/page.tsx`, `src/app/pricing/page.tsx`, `src/app/terms/page.tsx`, `src/app/privacy/page.tsx`, `src/app/not-found.tsx`, plus components

**CC prompt template:**

```
Reference: screen-spec-v1.md §0 (design language), §1 (marketing).
Reference: the preview HTML for visual fidelity — the design tokens,
typography stack, and spotlight behavior are LOCKED.

Build these pages:

1. src/app/page.tsx — landing page per screen-spec-v1.md §1.1.
   Includes: Hero, Features strip (3 cards), How-it-works strip with
   a sample response screenshot (use a real rendered AssistantResponse
   component with mock data), Pricing section (3 cards with Portrait
   highlighted), FAQ accordion (open one item by default), Footer.
   The "Get my settings" gold CTA appears in the hero and in nav.
   Nav is sticky with backdrop blur.

2. src/app/pricing/page.tsx — dedicated pricing page per §1.2.
   Three cards plus a feature matrix table with horizontal scroll
   on mobile.

3. src/app/terms/page.tsx and src/app/privacy/page.tsx — long-form
   text. Single column max-width 720px. Last-updated date at top.
   Sticky right-rail TOC on desktop ≥1100px; collapse to top
   dropdown on mobile.

4. src/app/not-found.tsx — 404 page per §1.4.

5. Components:
   - src/components/marketing/Spotlight.tsx — the gold gradient
     anchored by section. Uses the scroll-following behavior from
     the preview HTML. Honor prefers-reduced-motion (make it static
     when reduced).
   - src/components/marketing/Hero.tsx
   - src/components/marketing/Features.tsx
   - src/components/marketing/PricingCards.tsx — accepts a `compact`
     prop to render in landing vs full pricing page.
   - src/components/marketing/FAQ.tsx — accordion.
   - src/components/marketing/Footer.tsx
   - src/components/shared/Nav.tsx — adapts to logged-in vs out state.

Design rules:
- Use Fraunces for all H1/H2 headings, Geist for body, JetBrains Mono
  for numeric values (prices, etc.).
- Use CSS variables for all colors. The dark and light themes are
  defined in the preview HTML's :root[data-theme=...] blocks —
  reuse those exactly.
- All buttons follow the .btn pattern from the preview: btn-primary
  (gold), btn-outline, btn-ghost.
- Spotlight gradient appears only on marketing pages, not in /app.
- Mobile: nav collapses to hamburger; hero stacks; pricing becomes
  swipeable carousel with snap points (Portrait centered by default).

Test:
- Lighthouse score 90+ on landing (perf, a11y, best-practices, SEO).
- All links work.
- Theme toggle persists across page navigations.
- Pricing carousel snaps correctly on mobile.
```

**Exit criteria:** all five pages render cleanly in dark and light modes, on desktop and mobile, with Lighthouse passing.

---

## PACK 8 — Auth flows

**Phase:** 9.2
**Depends on:** Supabase Auth setup with magic link enabled
**Files affected:** `src/app/auth/*`

**CC prompt template:**

```
Reference: screen-spec-v1.md §2 (auth flows).
Reference: arch-spec-v3.1.md §5.1 (magic link).

Build all auth screens under src/app/auth/:

- signup/page.tsx — email + password + reveal-eye + strength meter +
  magic-link secondary button. Handle ?tier= query param for the
  banner. Per §2.1.
- signin/page.tsx — email + password + "Forgot password" link +
  magic-link secondary button. Per §2.2.
- check-email/page.tsx — interstitial with resend button (30s cooldown)
  and Open Gmail / Open Outlook quick-links. Per §2.3.
- callback/route.ts — handles the magic link redirect. Reads token_hash
  and type from query, calls Supabase Auth verify, signs the user in.
  Routes to /onboarding/camera if first sign-in (no camera_profile
  exists) OR /app otherwise. On failure (expired, used, tampered),
  routes to /auth/signin?error=link_expired. Per §2.4.
- verify-email/page.tsx — interstitial post-signup. Per §2.5.
- reset/page.tsx — password reset request. Always shows the same
  confirmation regardless of email existence. Per §2.6.
- reset/confirm/page.tsx — password reset completion. Two fields,
  strength meter, auto-signin on success. Per §2.7.

All forms:
- Inline validation on blur (email format, password length).
- Anti-enumeration: identical error messages for "no account" and
  "wrong password" on signin. Identical confirmation for reset
  regardless of email existence.
- Show specific errors only when safe (e.g., "weak password" inline
  on signup; "email already used" on signup since this isn't an
  enumeration vector — they're creating an account).
- Loading states on buttons during submission.
- Mobile: full-width buttons, 52px field heights minimum.

Each form uses the Supabase JS client (src/lib/supabase/client.ts —
create if missing). Magic link uses signInWithOtp().

Test:
- Sign up new user → verify email sent → click link → land in onboarding.
- Sign in existing user with password → land in /app.
- Sign in with magic link → land in /app.
- Forgot password → land on reset confirm → set new password → auto-signin.
- All anti-enumeration cases.
```

**Exit criteria:** all paths work end-to-end against the real Supabase instance.

---

## PACK 9 — Onboarding (camera profile capture)

**Phase:** 9.3
**Depends on:** Pack 6 (PUT /api/camera-profile)
**Files affected:** `src/app/onboarding/camera/page.tsx`

**CC prompt template:**

```
Reference: screen-spec-v1.md §3.1.

Build src/app/onboarding/camera/page.tsx — a 3-step flow:

Step 1: Body select. Heading "What do you shoot on?". Searchable
autocomplete with these starter options (these are exhaustive enough
for v1; expand list later):
- Canon: R5, R6, R6 Mark II, R10, R7, 5D Mark IV, 6D Mark II, 90D
- Sony: A7 IV, A7 III, A7R IV, A7C, A6700, A6400, A6000
- Nikon: Z9, Z8, Z7 II, Z6 II, Z5, Z50, D850, D780
- Fuji: X-T5, X-T4, X-H2, X-S20, X100V
- iPhone: 15 Pro Max, 15 Pro, 14 Pro, 13 Pro
- Other (free-text)

Step 2: Lenses multi-select. Same autocomplete pattern. User can
add multiple. Free-text fallback. Starter list includes common
lenses by mount (RF, E, Z, X, F, EF).

Step 3: Confirmation. Summary card showing body + lenses with an
"Edit" link routing back to step 1. Primary "Start shooting" button
routes to /app.

Every step has a "Skip" text link in the corner that routes to /app
with a localStorage flag pw-skipped-onboarding=true. The app empty
state can then show a "Add your camera in Settings" banner.

On step 3 save: PUT /api/camera-profile with the data.

Progress dots indicator at top showing current step.

Mobile: each step is full-screen. Skip + Continue buttons at the
bottom of the viewport, stacked vertically.

Test:
- Complete the flow → camera_profiles row exists for the user.
- Skip at step 1 → land in /app, no row created.
- Pick "Other" body → free-text input appears.
```

**Exit criteria:** flow completes, profile saved, skippable.

---

## PACK 10 — App shell + sidebar

**Phase:** 9.4
**Depends on:** Pack 6 (sessions list endpoint)
**Files affected:** `src/app/app/page.tsx`, `src/components/app/Sidebar.tsx`, `src/components/app/AppShell.tsx`

**CC prompt template:**

```
Reference: screen-spec-v1.md §4.1.
Reference: the preview HTML for desktop sidebar layout.

Build the app shell:

src/app/app/page.tsx — wraps the chat area in an AppShell layout.
This is a client component that:
- Fetches GET /api/sessions on mount; stashes in client state.
- Fetches GET /api/camera-profile on mount; stashes in client state.
- Fetches GET /api/credits on mount.
- Reads user's tier from a session/auth helper.

src/components/app/AppShell.tsx — layout component:
- Desktop: two-pane grid (260px sidebar + fluid main area).
- Mobile: single-pane with sidebar as overlay drawer.

src/components/app/Sidebar.tsx contains:
- Top: logo + "New scene" gold button.
- "Recent sessions" heading + list of sessions (last 3 for snapshot,
  all for paid). Each row: title + timestamp. Active session
  highlighted with gold left-border.
- For snapshot tier with >3 hidden sessions: teaser card "Your earlier
  sessions are saved — Upgrade to access them all" with Upgrade button.
- Coming soon section: three locked items (Taking photos, Editing,
  AI enhancement) at reduced opacity with "soon" pills. Not interactive.
- Bottom block:
  - Credits widget: shows usage as N / TIER_LIMIT, gold progress bar.
    Plus an "+" icon button opening the extra credits modal.
  - "Upgrade to Studio" gold-outlined CTA (or "Upgrade to Portrait" for
    Snapshot users; nothing shown for Studio users).
  - Account row: avatar (initials), name, tier display name, theme
    toggle icon, settings icon.

src/components/app/SidebarMobile.tsx (or use responsive CSS):
- Default state: hidden.
- Opens as a full-screen overlay drawer from the left.
- Backdrop with 0.5 opacity, fade animation.
- Dismiss: tap backdrop OR swipe-right-on-drawer.
- Chat area is hidden when drawer is open (per user's spec).
- Hamburger button in chat-area top bar opens it; 44x44 tap target min.

Test:
- New user (no sessions) → sidebar shows empty list, no upgrade teaser.
- Snapshot user with 5 sessions in DB → sidebar shows 3 + teaser.
- Portrait user with 50 sessions → sidebar shows all 50, scrollable.
- Mobile drawer: opens/closes correctly, backdrop tap closes it.
- Long session titles truncate with ellipsis and show full on hover/long-press.
```

**Exit criteria:** sidebar renders correctly across all tier and session-count permutations, mobile drawer works.

---

## PACK 11 — Composer + new scene empty state

**Phase:** 9.5
**Depends on:** Pack 10
**Files affected:** `src/components/app/ChatComposer.tsx`, `src/components/app/EmptyState.tsx`

**CC prompt template:**

```
Reference: screen-spec-v1.md §4.2.

Build the chat composer and empty state:

src/components/app/ChatComposer.tsx:
- Multi-line textarea-like input (use a contenteditable div or a
  resizing textarea), placeholder "Describe your shot — light,
  subject, lens, mood…".
- Auto-grows from 56px to max 5 lines, then scrolls internally.
- Send button: gold rounded square with paper-plane icon on the right.
- Disabled when input is empty (no error, just unresponsive).
- Enter to send, Shift+Enter for newline. Configurable.
- Disabled state when prop `disabled={true}` (used for rate limit,
  out-of-credits, etc.) — grayed background, no focus ring.
- Mobile: pinned to bottom of viewport via position:fixed when focused,
  scrolls naturally otherwise. Above the on-screen keyboard.

src/components/app/EmptyState.tsx (the new-scene state):
- Fraunces heading "What are you shooting?" centered above composer.
- Row of 3-4 example prompt chips below the heading; clicking pre-fills
  the composer.
- Initial chips:
  - "Backlit portrait at golden hour, 85mm, handheld"
  - "Indoor newborn near a north-facing window"
  - "Bird in flight, overcast, 400mm"
  - "Long exposure waterfall on a tripod"
- Mobile: chips wrap onto multiple lines.

Composer emits a "send" event with the text content. The parent (page
or session container) handles sending to /api/settings.

Test:
- Empty composer → send button disabled.
- Type and send → onSend fires with text, composer clears, send
  becomes disabled again.
- Click a chip → composer pre-filled, send button enabled.
- Mobile: composer stays above keyboard when focused.
```

**Exit criteria:** composer behaves correctly across all states and viewports.

---

## PACK 12 — Active session response states (the big one)

**Phase:** 9.6
**Depends on:** Packs 4 (real /api/settings), 11 (composer)
**Files affected:** many components under `src/components/app/`

**CC prompt template:**

```
Reference: screen-spec-v1.md §4.3 through §4.9 (all response states).
Reference: arch-spec-v3.1.md §7 (response shapes).

This is the most complex frontend pack. Build it in this order to
avoid integration headaches:

1. UserMessage.tsx — right-aligned bubble for user input.

2. LoadingSkeleton.tsx — the "thinking" state. Four skeleton cubes
   in the right grid layout + three skeleton panels. Pulses or
   shimmers. Includes the AI header "PhotoWhisperer · thinking…"
   with the gold pulsing dot. Timer logic:
   - After 8s: header text → "Still thinking…"
   - After 20s: a "Retry" button appears beneath.
   - After 30s: abort the request; parent should show ErrorCard.

3. SettingsCubes.tsx — accepts a response object and renders 4 cubes.
   Each cube is a CubeISO, CubeAperture, CubeShutter, or CubeWhiteBalance
   component. The first three are straightforward number renders per
   screen-spec §4.5.1.
   CubeWhiteBalance handles three states:
   a. Numeric + enum: large kelvin value (mono 36px) + enum label
      beneath in muted text. Used when color_temperature is non-null.
   b. Auto-only: word "Auto" in Fraunces 28px, no kelvin. Used when
      color_temperature is null.
   c. Flash: same as state (a) with enum "Flash" beneath; warning
      may mention sync.
   Each cube is tap/click-to-copy with a floating toast.

4. ResponsePanels.tsx — three panels:
   - Scene Summary (always present, full-width)
   - Assumptions (only if assumptions[] non-empty, half-width)
   - Warnings (only if warnings[] non-empty, half-width, amber border)
   Items joined by " · " separator within each panel body.
   Layout: scene summary full-width on top, assumptions+warnings as
   two-column below at desktop, all stacked on mobile.

5. ResponseActions.tsx — action row beneath panels:
   - Refine button (outline gold) → emits 'refine' event
   - Copy all (outline) → copies a formatted text block, toast
     "Copied to clipboard"
   - Thumbs up + thumbs down icon-buttons (ghost) → emit
     'feedback' event with value (analytics will pick up)

6. ClarificationCard.tsx — when status='clarification_required'.
   Shows a question-mark icon, label "Need a bit more info", and the
   question. Auto-focuses the composer.

7. InvalidInputCard.tsx — when status='invalid_input'.
   Shows a question-mark icon, label "Not quite enough to go on",
   and the message. Auto-focuses composer.

8. ErrorCard.tsx — when status='error' or network/timeout.
   Shows a warning icon, label "Something went sideways", body,
   and a Retry button. Retry re-sends without consuming a new
   quota slot (the original failed call didn't consume one either,
   per arch).
   After 3 consecutive retries, Retry becomes "Report a problem"
   linking to mailto.

9. AssistantResponse.tsx — orchestrator component. Takes a response
   object and renders one of:
   - LoadingSkeleton if loading
   - SettingsCubes + ResponsePanels + ResponseActions if status='ok'
   - ClarificationCard if status='clarification_required'
   - InvalidInputCard if status='invalid_input'
   - ErrorCard if status='error'

10. Session container (in src/app/app/page.tsx or a SessionView
    component): manages the message list, scroll position, and
    dispatches /api/settings calls. Stores session_id locally;
    appends user message immediately on send (optimistic), shows
    loading skeleton, swaps in the real response when it arrives.

Critical edge cases:
- Network abort mid-flight → swap to ErrorCard.
- API returns malformed JSON → ErrorCard with "Unexpected response."
- Cube tap-to-copy on mobile → use navigator.clipboard, fall back to
  document.execCommand for older browsers.

Test (manual):
- Send "backlit portrait at golden hour 85mm handheld" → cubes appear,
  panels render, all action buttons work.
- Send "?" → ClarificationCard appears, composer focuses.
- Send "asdfghjkl" → InvalidInputCard appears.
- Throttle network → after 30s, ErrorCard appears. Retry works.
- Tap a cube on desktop and mobile → clipboard contains the value.
```

**Exit criteria:** every state in screen-spec §4 renders correctly with real API responses. Stress-test scenarios from spec §8.

---

## PACK 13 — Out-of-credits + rate-limit + soft warning states

**Phase:** 9.7
**Depends on:** Pack 12
**Files affected:** `src/components/app/OutOfCreditsCard.tsx`, `src/components/app/SoftWarningBanner.tsx`, `src/components/app/RateLimitBanner.tsx`

**CC prompt template:**

```
Reference: screen-spec-v1.md §4.10 and §4.11.

Build three blocking/warning states:

1. OutOfCreditsCard.tsx — replaces the composer entirely when
   user's monthly quota AND extra credits are both exhausted.
   Shows: warning icon, Fraunces heading "You've hit your monthly limit",
   body with usage details and reset date, two buttons: "Buy extra credits"
   (primary gold, opens extra credits modal) and "Upgrade plan"
   (outline, routes to /pricing).
   Triggered when:
   - API returned 429 with quota_exceeded reason
   - OR client-side state shows monthly_count >= tier_limit AND
     credits_remaining = 0.

2. SoftWarningBanner.tsx — non-dismissable-per-load banner at top of
   chat area when monthly_count >= 0.8 * tier_limit (use
   SOFT_WARNING_THRESHOLD constant).
   Text: "You've used X of Y requests this month."
   Buttons: "Upgrade" (text link) and "Buy credits" (text link).
   Dismissable via small "x" button; dismissal persists in
   localStorage for this calendar month only.

3. RateLimitBanner.tsx — appears inline near the composer when API
   returns 429 with rate_limit reason (per-minute, not monthly).
   Text: "Easy — give us 20 seconds and try again."
   Includes a visible countdown that ticks down to 0.
   Composer is disabled for the duration of the countdown.
   When countdown hits 0, the banner disappears and composer re-enables.

Computation:
- "Out of credits" requires the latest credits_remaining from
  /api/credits. On any /api/settings response, the credits_remaining
  field updates client state; on a 429, also re-fetch /api/credits to
  ensure freshness.
- "Soft warning" uses the monthly_count from the latest /api/settings
  response.

Test:
- User at 4/5 → soft warning appears after the 4th request, hard
  out-of-credits after the 5th if no extra credits.
- Buy 5 extra credits → 6th request consumes a credit, no hard out.
- Burst 11 requests in 1 minute → 11th gets rate-limited; banner
  appears with countdown.
```

**Exit criteria:** all three states trigger correctly under their conditions.

---

## PACK 14 — Refinement flow (Option C concat)

**Phase:** 9.8
**Depends on:** Pack 12
**Files affected:** session container component, ChatComposer (for refine pre-fill)

**CC prompt template:**

```
Reference: screen-spec-v1.md §4.7.
Reference: arch-spec-v3.1.md §4 (Option C, single-shot agent +
client-side multi-turn).

Implement the refinement flow:

1. The "Refine" button on a prior assistant response emits a 'refine'
   event with the prior response object.

2. Session container handles 'refine':
   - Pre-fills the composer with "Same scene but " (with trailing space).
   - Focuses the composer.
   - Stores the prior turn's { user_msg, assistant_summary } in
     refinementContext state.

3. On the next send, if refinementContext is non-null:
   - Build the request body:
     {
       conditions: <user's new input>,
       session_id: <current session_id>,
       prior_context: refinementContext
     }
   - Send to /api/settings.
   - Clear refinementContext after the response arrives (regardless
     of status).

4. Cap on history depth: only the IMMEDIATELY PRIOR pair is included.
   When a user refines a refinement, the new refinementContext is the
   most recent pair, not the original original.

5. Visual cue (subtle): when refinementContext is non-null, the
   composer placeholder changes to "Refining the last shot — what
   should change?" Cleared once the response arrives.

6. If the user types a completely new scene (no semantic relation to
   the prior turn), the concat still happens — we leave it to the
   classifier to interpret. v1.1 could add a heuristic to detect
   "new scene" intent and drop the prior_context.

Important: clarification responses ALSO use prior_context concat, not
just explicit Refine clicks. When a ClarificationCard is rendered and
the user replies, the reply automatically includes prior_context.

Test:
- Make a request → get a response → click Refine → composer pre-fills
  → type "darker mood" → send → response acknowledges continuity with
  prior scene.
- Refine a refinement → only the immediately prior pair is in context.
- Get a clarification → reply → reply is sent with prior_context auto-filled.
```

**Exit criteria:** refinement and clarification both work end-to-end with proper context concat.

---

## PACK 15 — Account / Settings page

**Phase:** 9.9
**Depends on:** Pack 6
**Files affected:** `src/app/account/page.tsx` and sub-components

**CC prompt template:**

```
Reference: screen-spec-v1.md §5.1.

Build src/app/account/page.tsx with 5 sections:

1. Profile — Email (read-only with Edit modal that triggers Supabase
   email-change flow), display name (optional, free-text).

2. Camera — Edits camera_profile. Body autocomplete, lenses multi-select,
   flash dropdown (None / Speedlight / Studio strobe), notes textarea.
   Disclosure explaining why we collect this. Uses PUT /api/camera-profile.

3. Preferences — Theme toggle (Dark / Light / System), default focal
   length number input (optional, persisted in user preferences).
   Product email opt-in checkboxes.

4. Security — Change password (current + new + confirm fields), Active
   sessions list (Supabase Auth admin API gives this) with per-session
   sign-out buttons, "Sign out everywhere" button.

5. Danger Zone — visually separated with amber border.
   - "Export my data" → downloads a JSON file with the user's sessions,
     camera profile, billing summary. Implement via a server route
     GET /api/account/export that aggregates and streams JSON.
   - "Delete account" → opens typed-confirmation modal: "Type DELETE to
     confirm. Your account will be permanently removed after a 7-day
     grace period. Emails will be sent at scheduling and at completion."
     On confirm, mark account for deletion (set a flag like
     deleted_at_scheduled in users table; cron or scheduled function
     handles the cascade after 7 days — flagged as v1.1 if cron is
     out of scope for now).

Layout:
- Desktop: left rail with section tabs, right pane with form.
- Mobile: top horizontal scroll of tabs, form fills below.
- Sticky save bar at bottom when any form has unsaved changes.

Test:
- Update camera profile → row updates, /api/settings sees new gear.
- Change email → verification flow triggers; old email still works
  until verified.
- Sign out everywhere → all sessions invalidated.
- Trigger delete account flow → confirmation modal appears, requires
  typing DELETE.
```

**Exit criteria:** all five sections functional. Camera profile changes propagate to /api/settings responses.

---

## PACK 16 — Billing page + extra credits modal

**Phase:** 9.10
**Depends on:** Packs 5 (Stripe), 6 (credits endpoint)
**Files affected:** `src/app/account/billing/page.tsx`, `src/app/billing/success/page.tsx`, `src/app/billing/cancel/page.tsx`, `src/components/shared/CreditPackPicker.tsx`

**CC prompt template:**

```
Reference: screen-spec-v1.md §5.2, §5.3, §5.4, §5.5.

Build:

1. src/app/account/billing/page.tsx with sections:
   - Current plan card (tier display name, price, renewal date or
     "Free — no renewal", Change plan + Cancel buttons routing to
     /api/stripe/portal).
   - Usage section (expanded version of sidebar credits block).
   - Extra credits card with three pack options (50/200/500), each
     with a "Buy" button calling POST /api/stripe/checkout/credits
     and routing to the returned URL.
   - Payment method (read from Stripe via portal).
   - Invoice history table.

2. src/app/billing/success/page.tsx — confirmation page, auto-redirects
   to /app after 4s.

3. src/app/billing/cancel/page.tsx — "Purchase canceled" page.
   Optional single-question survey.

4. src/components/shared/CreditPackPicker.tsx — reusable component
   used in both the billing page and the "+" credits modal.
   Three cards: 50 / 200 / 500. Shows price (from a constant or
   from a server-side echo from Stripe). Each Buy button → POST
   /api/stripe/checkout/credits with the pack code → window.location
   = response.url.

5. The "+" button in the sidebar credits block opens a modal containing
   CreditPackPicker. Mobile: modal becomes full-screen sheet.

After successful purchase, the billing/success page auto-polls
/api/credits every 2 seconds for up to 30 seconds to see when the
new balance reflects. If not by 30s, show "Refresh to check." Once
detected, show toast "Added X credits."

Test:
- Buy a credit pack via Stripe test card → land on success page →
  credits balance updates within seconds.
- Cancel out of checkout → land on cancel page.
- Update payment method via portal → return to billing page, see
  updated card.
- Subscribe to Portrait → tier shows Portrait, next renewal date shows.
- Cancel subscription via portal → tier flips to Snapshot at period end.
```

**Exit criteria:** full Stripe round trip works in test mode for both subscriptions and credit packs.

---

## PACK 17 — Mobile polish + reduced motion + theme transitions

**Phase:** 9.12 + 9.13
**Depends on:** all prior frontend packs
**Files affected:** various

**CC prompt template:**

```
Reference: screen-spec-v1.md §6 (mobile-specific notes) and §0 (motion).

Cross-cutting mobile and motion polish:

1. Sidebar drawer on mobile — verify per spec §6:
   - Hidden by default.
   - Hamburger opens it full-screen.
   - Backdrop tap closes it.
   - Swipe-right-on-drawer closes it (use a touch event listener
     tracking deltaX > threshold).
   - Chat area is hidden when drawer is open.

2. Composer on mobile — verify it pins above the on-screen keyboard
   correctly. Test on real iOS Safari and Chrome Android, not just
   browser DevTools simulation.

3. Touch targets — audit all interactive elements for 44x44px minimum.
   Audit gaps between adjacent buttons for 8px minimum.

4. Pricing carousel on mobile — snap-points, three dot indicators,
   Portrait card centered by default on mount.

5. Reduced motion — implement honoring prefers-reduced-motion: reduce:
   - Spotlight gradient on marketing pages: static positioning, no
     scroll-following animation.
   - Page transitions: instant (transition-duration: 0).
   - Modal/drawer animations: instant.

6. Theme transitions — when toggling theme, all surfaces transition
   color over ~300ms via CSS transition on background-color, color,
   border-color. Avoid FOUC by setting data-theme on <html> before
   the body renders (use a tiny inline script in <head>).

7. Cosmetic "coming soon" sidebar items — render Taking photos,
   Editing, AI enhancement at reduced opacity with "soon" pills.
   Not interactive. Per screen-spec §4.1.

Test:
- iOS Safari real device: composer pin behavior, scroll behavior,
  drawer swipe.
- Android Chrome real device: same.
- DevTools: simulate prefers-reduced-motion: reduce → all motion
  becomes instant.
- Theme toggle: no flash of unstyled content on initial page load.
```

**Exit criteria:** all mobile behaviors verified on real devices, reduced motion respected, no FOUC.

---

## PACK 18 — Rate limiting, logging, security headers

**Phase:** 10
**Depends on:** prior phases
**Files affected:** `src/lib/ratelimit.ts`, `next.config.js`, Sentry setup

**CC prompt template:**

```
Reference: arch-spec-v3.1.md §5.2.
Reference: screen-spec-v1.md §8 (stress-test scenarios).

1. Per-minute rate limit (10 req/min per user) via @upstash/ratelimit:
   - src/lib/ratelimit.ts wraps Upstash with a fallback no-op for local
     dev when env vars missing.
   - Apply in /api/settings handler. Return 429 with rate_limit reason
     when triggered.

2. Sentry integration:
   - npm i @sentry/nextjs.
   - Configure sentry.client.config.ts and sentry.server.config.ts.
   - Capture exceptions from API routes and frontend.
   - Filter PII: don't send the user's scene descriptions verbatim;
     include user_id and request shape only.

3. Security headers in next.config.js:
   - Strict-Transport-Security: max-age=31536000; includeSubDomains
   - X-Frame-Options: DENY
   - X-Content-Type-Options: nosniff
   - Referrer-Policy: strict-origin-when-cross-origin
   - Content-Security-Policy: tight policy allowing only self,
     Anthropic API, Supabase, Stripe.

4. Cookie consent banner (for EU compliance):
   - Minimal banner at bottom of screen on first visit.
   - "We use cookies for authentication and analytics. [Accept]
     [Decline]"
   - Decline disables analytics; auth cookies always set (essential).
   - Banner state persisted in localStorage.

5. Run through stress-test scenarios from screen-spec §8 manually.

Test:
- Burst 11 requests in 60s → 11th returns 429.
- Force a network failure mid-request → error captured in Sentry.
- Lighthouse on landing: 90+ in all categories.
- Cookie banner appears on first visit, persists after dismissing.
```

**Exit criteria:** Lighthouse 90+, security headers verified via securityheaders.com, Sentry capturing real errors.

---

## ORDER YOU SHOULD ACTUALLY BUILD IN

Recommended sequence by week (rough):

- **Week 1:** Packs 1–3 (DB, middleware, stub endpoint with sessions).
- **Week 2:** Packs 4–6 (real classifier wiring, Stripe, read endpoints).
- **Week 3:** Packs 7–8 (marketing + auth pages).
- **Week 4:** Packs 9–11 (onboarding + app shell + composer).
- **Week 5:** Pack 12 (response states — the big one).
- **Week 6:** Packs 13–14 (out-of-credits + refinement).
- **Week 7:** Packs 15–16 (account + billing).
- **Week 8:** Packs 17–18 (mobile polish + security/logging).

This is rough — Pack 12 alone can take 2 weeks if you're being a perfectionist on the cube states. Don't rush it; it's the user's central interaction.

---

## SANITY CHECKS BEFORE LAUNCH

1. Walk through the 8 stress-test scenarios in screen-spec §8.
2. Test full happy path on iOS Safari and Android Chrome.
3. Test full happy path with adblockers and tracker blockers enabled.
4. Run Lighthouse on all marketing pages.
5. Run accessibility audit (axe DevTools) on /app — fix all critical issues.
6. Test all 4 response shapes against the real classifier.
7. Test all Stripe flows in test mode end-to-end.
8. Test account deletion (the typed-confirm modal, the grace period).
9. Test extreme inputs (empty, 5000 chars, non-English, emoji, code injection).
10. Verify RLS by attempting cross-user reads from a second test account.
