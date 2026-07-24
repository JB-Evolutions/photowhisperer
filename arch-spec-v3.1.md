# Photo Whisperer — Architecture Specification

**Version:** 3.1 — single-shot agent, client-side multi-turn context (Option C), tier rename, camera profile, sessions, extra credits, magic-link auth.
**Status:** Canonical reference. Replaces v3.0. Changes from v3.0 listed in Appendix A.

---

## 0. Overview

| Property | Value |
|---|---|
| Domain | photographywhisperer.com |
| Core function | Photography settings calculator. In: natural-language shooting conditions + optional camera profile + optional prior-turn context. Out: ISO, aperture, shutter speed, white balance, color temperature, assumptions, warnings. |
| Stack | Next.js 14+ / Vercel / Supabase Postgres + Auth / Stripe / Anthropic Sonnet 4.6 |
| Architecture | Two-stage agent: LLM classifier produces structured scene; pure-code calculator computes exposure-correct settings. **The agent is single-shot** — each `/api/settings` call is independent and stateless. Multi-turn UX (refinement, clarification) is implemented **client-side** by concatenating prior-turn context into the next prompt. |
| Auth | Supabase Auth. JWT, 1-hour lifetime, silent refresh. Email+password primary, magic link secondary. All API routes require valid JWT except `/api/webhooks/*`. |
| Tiers | **Snapshot / Portrait / Studio** (UI names). DB enum: `snapshot / portrait / studio` (renamed from v3.0's `free / silver / gold`). |
| Limits | Snapshot 5/mo, Portrait 500/mo, Studio 2000/mo. All numbers in `TIER_LIMITS` constant, adjustable without schema change. All tiers hard-capped; users exceed via extra credits. |
| Extra credits | One-time-purchase top-ups. Don't expire. Consumed only after monthly tier quota exhausts. |
| Session history | UI-side conversational threading backed by `sessions` and `session_messages` tables. Free tier sees last 3 sessions; paid tiers see all. |
| Camera profile | Per-user gear context (body, lenses, flash). Optional. Injected into every `/api/settings` request when present. |

---

## 1. System Architecture

### 1.1 Request flow

```
User (browser)
│
├─ POST /api/settings ─────────────────────────────────────────────┐
│  Header: Authorization: Bearer {jwt}                             │
│  Body: { conditions: string,                                     │
│          session_id?: uuid,                                      │
│          prior_context?: { user_msg, assistant_summary } }       │
│  ▼                                                               │
│  Next.js API Route Handler                                       │
│  │                                                               │
│  ├─ JWT Validation (Supabase Auth) ──── 401 on failure           │
│  ├─ Per-minute rate limit check ────── 429 on failure            │
│  ├─ Subscription + quota pre-check ─── 429 on failure            │
│  ├─ Fetch camera_profile for user (if exists) ─── inject         │
│  │                                                               │
│  ▼                                                               │
│  getSettings(conditions, camera_profile, prior_context)          │
│  │                                                               │
│  │  Stage 1: callClassifier(conditions, camera_profile, prior)   │
│  │  ├─ Build prompt: base + camera context + prior context       │
│  │  ├─ Anthropic Sonnet API call                                 │
│  │  ├─ Parse JSON response                                       │
│  │  └─ Returns: ok | clarification_required | invalid_input      │
│  │                                                               │
│  │  Stage 2 (only if classifier returned "ok"):                  │
│  │     calculateSettings(scene)  [SEALED]                        │
│  │                                                               │
│  ▼                                                               │
│  If status === "ok":                                             │
│    1. check_and_increment_quota_with_credits()                   │
│    2. ensure_session(session_id) — create if null                │
│    3. append user message + assistant message to session         │
│    4. update session title from scene_summary if untitled        │
│                                                                  │
│  Return JSON to frontend (includes session_id back)              │
└──────────────────────────────────────────────────────────────────┘
```

### 1.2 Component inventory

| Component | Technology | Responsibility |
|---|---|---|
| Auth service | Supabase Auth | JWT, password + magic link, verification, reset |
| API gateway | Next.js App Router | Route handling, middleware, request/response formatting |
| Database | Supabase Postgres | Tables: users, subscriptions, usage_tracking, camera_profiles, sessions, session_messages, credit_balances |
| Classifier | `src/api/classifier.ts` | Anthropic call. Returns structured scene JSON. Receives camera profile and prior context. |
| Calculator | `src/calculator/*` | Pure EV solver. **SEALED.** 21 tests. |
| Orchestrator | `src/api/orchestrate.ts` | `getSettings()` — combines classifier and calculator, handles errors. |
| Quota fn | `check_and_increment_quota_with_credits()` Postgres function | Atomic check + increment, consuming from credits when tier exhausted |
| Stripe handlers | Next.js API routes | Subscription webhooks + one-time credit-pack webhooks |
| Sessions handler | `src/lib/sessions.ts` | Server-side session and message persistence inside `/api/settings` |
| Camera profile fetch | `src/lib/camera-profile.ts` | Per-request fetch and prompt-injection helper |

---

## 2. Database Schema

### 2.1 users (unchanged from v3.0)

```sql
CREATE TABLE users (
  user_id    UUID PRIMARY KEY DEFAULT auth.uid(),
  email      VARCHAR(255) UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

Trigger `handle_new_user` creates rows in `users`, `subscriptions` (`tier='snapshot'`), and `credit_balances` (`credits_remaining=0`) on Supabase Auth signup.

### 2.2 subscriptions (tier rename)

```sql
CREATE TABLE subscriptions (
  subscription_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  tier                   VARCHAR(50) NOT NULL DEFAULT 'snapshot',
  start_date             TIMESTAMP DEFAULT NOW(),
  end_date               TIMESTAMP,
  status                 VARCHAR(50) NOT NULL DEFAULT 'active',
  stripe_customer_id     VARCHAR(255) UNIQUE,
  stripe_subscription_id VARCHAR(255) UNIQUE,
  created_at             TIMESTAMP DEFAULT NOW(),
  updated_at             TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX idx_subscriptions_stripe_sub_id ON subscriptions(stripe_subscription_id);
```

**Tier enum:** `snapshot | portrait | studio` (renamed from `free | silver | gold`).
**Status enum:** unchanged.

If migrating from v3.0 schema: `UPDATE subscriptions SET tier = 'snapshot' WHERE tier = 'free'`, then `portrait` from `silver`, then `studio` from `gold`. Update `handle_new_user` trigger to use `'snapshot'`.

### 2.3 usage_tracking (unchanged structure)

```sql
CREATE TABLE usage_tracking (
  usage_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  month         INT NOT NULL CHECK (month >= 1 AND month <= 12),
  year          INT NOT NULL,
  request_count INT NOT NULL DEFAULT 0,
  created_at    TIMESTAMP DEFAULT NOW(),
  updated_at    TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, month, year)
);

CREATE INDEX idx_usage_tracking_user_month_year ON usage_tracking(user_id, month, year);
```

### 2.4 credit_balances (NEW — extra credits flow)

```sql
CREATE TABLE credit_balances (
  user_id            UUID PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
  credits_remaining  INT NOT NULL DEFAULT 0,
  total_purchased    INT NOT NULL DEFAULT 0,  -- lifetime, for analytics
  last_purchased_at  TIMESTAMP,
  updated_at         TIMESTAMP DEFAULT NOW(),
  CHECK (credits_remaining >= 0)
);
```

**Behavior:**
- Single row per user. Created with `credits_remaining=0` on signup by the `handle_new_user` trigger.
- Stripe credit-pack purchase webhook increments `credits_remaining` and `total_purchased`, sets `last_purchased_at`.
- Credits never expire (v1 decision; revisit if abuse appears).
- Credits consumed only after monthly tier quota is exhausted — see updated quota function below.

**RLS:**
```sql
ALTER TABLE credit_balances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own credits" ON credit_balances
  FOR SELECT USING (auth.uid() = user_id);
```

### 2.5 camera_profiles (NEW)

```sql
CREATE TABLE camera_profiles (
  user_id     UUID PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
  body        VARCHAR(255),
  lenses      TEXT[],
  flash       VARCHAR(50),  -- 'none' | 'speedlight' | 'studio' | NULL
  notes       TEXT,
  updated_at  TIMESTAMP DEFAULT NOW()
);
```

**Behavior:**
- Single row per user. Created lazily on first save (no signup-trigger row, to keep it explicit). Onboarding may skip; absence is acceptable.
- Frontend fetches on app mount and stashes in client state.
- API route `GET /api/camera-profile` returns the row or `null`.
- API route `PUT /api/camera-profile` upserts.
- `/api/settings` server-side fetches the row each request and injects into classifier prompt.

**RLS:**
```sql
ALTER TABLE camera_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own profile" ON camera_profiles
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users update own profile" ON camera_profiles
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);  -- prevents user from rewriting user_id to another user's UUID
CREATE POLICY "Users insert own profile" ON camera_profiles
  FOR INSERT WITH CHECK (auth.uid() = user_id);
```

### 2.6 sessions (NEW)

```sql
CREATE TABLE sessions (
  session_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  title        VARCHAR(120),  -- auto-generated from first scene_summary, nullable until then
  created_at   TIMESTAMP DEFAULT NOW(),
  updated_at   TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_sessions_user_updated ON sessions(user_id, updated_at DESC);
```

**RLS:**
```sql
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own sessions" ON sessions
  FOR SELECT USING (auth.uid() = user_id);
-- No INSERT/UPDATE policy for client; server-side service role writes
```

### 2.7 session_messages (NEW)

```sql
CREATE TABLE session_messages (
  message_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    UUID NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
  role          VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant')),
  content       JSONB NOT NULL,  -- text for user, structured response JSON for assistant
  created_at    TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_messages_session_created ON session_messages(session_id, created_at);
```

**Content shape for `role='user'`:**
```json
{ "text": "Shooting backlit portrait at golden hour, 85mm, handheld" }
```

**Content shape for `role='assistant'`:**
```json
{
  "status": "ok",
  "iso": 200, "aperture": "f/2.0", "shutter_speed": "1/500",
  "white_balance": "cloudy", "color_temperature": "6500K",
  "assumptions": [...], "warnings": [...],
  "scene_summary": "..."
}
```

OR for non-ok statuses, the response shape returned by the orchestrator (clarification/invalid/error). Storing error responses is useful for debugging.

**RLS:** equivalent to sessions; user can SELECT only their own session's messages via a JOIN-aware policy:

```sql
ALTER TABLE session_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own session messages" ON session_messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM sessions
      WHERE sessions.session_id = session_messages.session_id
      AND sessions.user_id = auth.uid()
    )
  );
```

### 2.8 Atomic quota + credits function (REPLACES v3.0's `check_and_increment_quota`)

```sql
CREATE OR REPLACE FUNCTION check_and_increment_quota_with_credits(
  p_user_id UUID,
  p_month INT,
  p_year INT,
  p_tier_limit INT  -- pass a positive int for capped tier; -1 reserved for admin/internal unlimited access, not used by any production tier in v1
)
RETURNS TABLE(success BOOLEAN, monthly_count INT, credits_used BOOLEAN, credits_remaining INT)
AS $$
DECLARE
  v_count INT;
  v_credits INT;
BEGIN
  -- Ensure usage_tracking row exists
  INSERT INTO usage_tracking (user_id, month, year, request_count)
  VALUES (p_user_id, p_month, p_year, 0)
  ON CONFLICT (user_id, month, year) DO NOTHING;

  -- Lock the usage row
  SELECT request_count INTO v_count
  FROM usage_tracking
  WHERE user_id = p_user_id AND month = p_month AND year = p_year
  FOR UPDATE;

  -- Unlimited (reserved; no production tier uses this in v1): always increment, no credits consumed
  IF p_tier_limit = -1 THEN
    UPDATE usage_tracking SET request_count = v_count + 1, updated_at = NOW()
    WHERE user_id = p_user_id AND month = p_month AND year = p_year;

    SELECT credits_remaining INTO v_credits FROM credit_balances WHERE user_id = p_user_id;
    RETURN QUERY SELECT TRUE, v_count + 1, FALSE, COALESCE(v_credits, 0);
    RETURN;
  END IF;

  -- Within tier limit: increment monthly count, no credits consumed
  IF v_count < p_tier_limit THEN
    UPDATE usage_tracking SET request_count = v_count + 1, updated_at = NOW()
    WHERE user_id = p_user_id AND month = p_month AND year = p_year;

    SELECT credits_remaining INTO v_credits FROM credit_balances WHERE user_id = p_user_id;
    RETURN QUERY SELECT TRUE, v_count + 1, FALSE, COALESCE(v_credits, 0);
    RETURN;
  END IF;

  -- Over tier limit: try to consume one extra credit
  SELECT credits_remaining INTO v_credits FROM credit_balances WHERE user_id = p_user_id FOR UPDATE;

  IF COALESCE(v_credits, 0) > 0 THEN
    UPDATE credit_balances SET credits_remaining = v_credits - 1, updated_at = NOW()
    WHERE user_id = p_user_id;
    -- Still increment monthly count for accurate "total requests this month" reporting
    UPDATE usage_tracking SET request_count = v_count + 1, updated_at = NOW()
    WHERE user_id = p_user_id AND month = p_month AND year = p_year;
    RETURN QUERY SELECT TRUE, v_count + 1, TRUE, v_credits - 1;
    RETURN;
  END IF;

  -- Hard out: no monthly capacity, no extra credits
  RETURN QUERY SELECT FALSE, v_count, FALSE, COALESCE(v_credits, 0);
END;
$$ LANGUAGE plpgsql;
```

The function returns four values so the API route can tell the frontend whether a credit was consumed (UI shows a different toast: "Used 1 of your extra credits").

### 2.9 Removed from v3.0

- `check_and_increment_quota` (legacy two-arg version) — replaced by the credits-aware version above.
- Tier values `free / silver / gold` — replaced.

---

## 3. Tier Mapping

```ts
// src/lib/quota.ts
export const TIER_LIMITS = {
  snapshot: 5,
  portrait: 500,
  studio: 2000,  // hard cap; extra credits extend beyond
} as const;

export const TIER_DISPLAY_NAMES = {
  snapshot: 'Snapshot',
  portrait: 'Portrait',
  studio: 'Studio',
} as const;

export const TIER_PRICES_USD = {
  snapshot: 0,
  portrait: 14,
  studio: 39,
} as const;

export const TIER_HISTORY_LIMITS = {
  snapshot: 3,
  portrait: -1,
  studio: -1,
} as const;

export const SOFT_WARNING_THRESHOLD = 0.8; // 80% of monthly limit

export function getTierLimit(tier: string): number {
  return TIER_LIMITS[tier as keyof typeof TIER_LIMITS] ?? TIER_LIMITS.snapshot;
}

export function getHistoryLimit(tier: string): number {
  return TIER_HISTORY_LIMITS[tier as keyof typeof TIER_HISTORY_LIMITS] ?? 3;
}
```

---

## 4. Single-Shot Agent + Client-Side Multi-Turn (Option C)

The classifier and calculator are stateless. The frontend simulates multi-turn UX by silently concatenating the immediately prior user message and the prior assistant's `scene_summary` into the next request's `conditions` string.

### 4.1 Concatenation pattern

When a user refines a prior response or answers a clarification:

```
[Original scene]: <prior user message text>
[Settings calculated]: <one-line summary of prior cubes: "ISO 200, f/2.0, 1/500, 5500K">
[Prior scene summary]: <prior assistant scene_summary>
[New input]: <user's new message>
```

The full string is sent as the `conditions` field of `/api/settings`. The classifier sees one bigger prompt; the agent has no memory.

### 4.2 Cap

Only the **immediately prior** user+assistant pair is included. Going further back makes prompts long, expensive, and unpredictable. If the user refines a refinement, only the most recent refinement and its response are included — not the original original.

### 4.3 Optional `prior_context` field on `/api/settings`

The API route accepts an optional `prior_context: { user_msg: string, assistant_summary: string }`. The server-side prompt builder formats this into the classifier prompt structure. If absent, the prompt has no prior-context block. This keeps the concatenation logic on the server and the frontend just passes the structured prior turn.

### 4.4 Sessions as UI grouping, not agent state

The `sessions` table groups related turns for display. The agent doesn't read from it. The frontend reads session_messages to render the thread; the server writes to it after each successful response. Sessions are purely a UI/persistence concept.

---

## 5. Authentication & Security

### 5.1 Magic link (NEW)

Supabase Auth supports magic link natively. Enable in the Supabase dashboard. Email template should match the brand voice and link to:

```
https://photographywhisperer.com/auth/callback?token_hash={{ .TokenHash }}&type=magiclink
```

`/auth/callback` route handler processes the token, signs the user in, and redirects to `/app` (or `/onboarding/camera` for first-time users).

Sign-in UI offers both password and magic link; password is primary on desktop, both equally weighted on mobile.

### 5.2 JWT, HTTPS, HSTS, rate limiting

Unchanged from v3.0. See v3.0 section 5 for full details. Per-minute rate limit is 10 req/min per user via `@upstash/ratelimit`. Monthly quota enforced via the quota function in 2.8.

---

## 6. Stripe Integration

### 6.1 Subscription products

Three subscription products in Stripe Dashboard:

| Product | Env var for price ID | App tier |
|---|---|---|
| Snapshot | (no Stripe product needed) | `snapshot` |
| Portrait | `STRIPE_PRICE_ID_PORTRAIT` | `portrait` |
| Studio | `STRIPE_PRICE_ID_STUDIO` | `studio` |

Subscription webhook events handled: `customer.subscription.created`, `customer.subscription.updated`, `invoice.payment_succeeded`, `invoice.payment_failed`, `customer.subscription.deleted` — same as v3.0.

### 6.2 Credit pack products (NEW)

Three one-time-purchase products in Stripe Dashboard:

| Product | Env var | Credits granted |
|---|---|---|
| Pack S | `STRIPE_PRICE_ID_CREDITS_50` | 50 |
| Pack M | `STRIPE_PRICE_ID_CREDITS_200` | 200 |
| Pack L | `STRIPE_PRICE_ID_CREDITS_500` | 500 |

**Pricing TBD** — finalize before Phase 8. Suggested: $5 / $15 / $30 (clear per-credit discount at higher tiers without undercutting the subscription value).

Credit pack purchase metadata in Stripe must include `credit_amount: 50` (or 200/500). Webhook handler reads this and increments `credit_balances`.

### 6.3 Credit pack webhook

Listen for `checkout.session.completed` events where `mode === 'payment'` (one-time) and `payment_status === 'paid'`. Extract user_id from Stripe metadata, extract credit_amount from product metadata, call an idempotent increment:

```sql
INSERT INTO credit_balances (user_id, credits_remaining, total_purchased, last_purchased_at)
VALUES ($user_id, $credit_amount, $credit_amount, NOW())
ON CONFLICT (user_id) DO UPDATE
SET credits_remaining = credit_balances.credits_remaining + $credit_amount,
    total_purchased = credit_balances.total_purchased + $credit_amount,
    last_purchased_at = NOW(),
    updated_at = NOW();
```

Idempotency: use Stripe's `event.id` as a deduplication key, stored in a `stripe_events_processed` table or via Stripe's own delivery tracking. Don't process the same `checkout.session.completed` twice — refund disputes will result.

### 6.4 Checkout entry points

- `POST /api/stripe/checkout/subscription` — body `{ tier: 'portrait' | 'studio' }`, creates subscription Checkout session
- `POST /api/stripe/checkout/credits` — body `{ pack: 's' | 'm' | 'l' }`, creates one-time-payment Checkout session
- `GET /api/stripe/portal` — creates Customer Portal session

---

## 7. API Reference

### POST /api/settings (updated)

**Auth:** required
**Body:**
```json
{
  "conditions": "string (required, 1-1000 chars)",
  "session_id": "uuid (optional, omit for new session)",
  "prior_context": {
    "user_msg": "string",
    "assistant_summary": "string"
  }
}
```

**Handler sequence:**
1. Validate JWT
2. Per-minute rate limit check
3. Subscription + quota pre-check (using `check_and_increment_quota_with_credits` with `request_count` < `limit + credits` semantics — pre-check is approximate, the real authority is the atomic function)
4. Validate input
5. Fetch user's `camera_profile` (may be null)
6. Call `getSettings(conditions, camera_profile, prior_context)`
7. If `status: "ok"`:
   - Call atomic quota function. If returns `success=false` (race condition caught), return 429.
   - Ensure session exists (create if `session_id` was null, returning the new UUID).
   - Insert user message + assistant message rows.
   - If session has no title yet, generate from `scene_summary` (first 80 chars or first sentence) and update.
8. Return JSON

**Response — ok (updated to include session_id, credits_used):**
```json
{
  "status": "ok",
  "session_id": "uuid",
  "iso": 400,
  "aperture": "f/5.6",
  "shutter_speed": "1/1000",
  "white_balance": "cloudy",
  "color_temperature": "6500K",
  "assumptions": [],
  "warnings": [],
  "scene_summary": "Soccer match under bright overcast...",
  "credits_used": false,
  "monthly_count": 47,
  "credits_remaining": 0
}
```

Other response shapes (clarification/invalid/error) unchanged from v3.0 — they don't increment quota or write to sessions.

### GET /api/sessions (NEW)

**Auth:** required
**Returns:** list of sessions for the current user, ordered by `updated_at DESC`, capped at the tier's `TIER_HISTORY_LIMITS` value (3 for Snapshot, all for paid tiers).

```json
{
  "sessions": [
    { "session_id": "uuid", "title": "Backlit portrait, golden hour", "updated_at": "2026-05-20T18:42:00Z" }
  ]
}
```

### GET /api/sessions/:id (NEW)

**Auth:** required
**Returns:** session metadata + all messages, ordered by `created_at ASC`. RLS ensures the user owns the session; otherwise 404.

```json
{
  "session_id": "uuid",
  "title": "...",
  "messages": [
    { "message_id": "uuid", "role": "user", "content": { "text": "..." }, "created_at": "..." },
    { "message_id": "uuid", "role": "assistant", "content": { /* full response */ }, "created_at": "..." }
  ]
}
```

### GET /api/camera-profile (NEW)

**Auth:** required
**Returns:** the user's camera profile row, or `null` if not set.

### PUT /api/camera-profile (NEW)

**Auth:** required
**Body:** `{ body, lenses, flash, notes }` — any subset.
**Effect:** upserts the user's row.

### GET /api/credits (NEW)

**Auth:** required
**Returns:** `{ credits_remaining: number, total_purchased: number }`.

### POST /api/stripe/checkout/credits (NEW)

**Auth:** required
**Body:** `{ pack: 's' | 'm' | 'l' }`
**Returns:** `{ url: string }` — Stripe Checkout URL.

### Error status codes (unchanged)

Same as v3.0. 400/401/429/500/503.

---

## 8. Repository Structure (updated)

Additions to v3.0 layout:

```
src/
├── app/
│   ├── api/
│   │   ├── settings/route.ts             (updated for session + credits)
│   │   ├── sessions/
│   │   │   ├── route.ts                  (NEW — GET list)
│   │   │   └── [id]/route.ts             (NEW — GET single)
│   │   ├── camera-profile/route.ts       (NEW — GET, PUT)
│   │   ├── credits/route.ts              (NEW — GET balance)
│   │   ├── stripe/
│   │   │   ├── checkout/
│   │   │   │   ├── subscription/route.ts (was: checkout/route.ts)
│   │   │   │   └── credits/route.ts      (NEW)
│   │   │   └── portal/route.ts           (unchanged)
│   │   └── webhooks/
│   │       └── stripe/route.ts           (updated to handle one-time payments)
│   ├── auth/
│   │   ├── signup/page.tsx               (NEW)
│   │   ├── signin/page.tsx               (NEW)
│   │   ├── verify-email/page.tsx         (NEW)
│   │   ├── check-email/page.tsx          (NEW — magic link sent)
│   │   ├── callback/route.ts             (NEW — magic link + verify handler)
│   │   ├── reset/page.tsx                (NEW)
│   │   └── reset/confirm/page.tsx        (NEW)
│   ├── onboarding/
│   │   └── camera/page.tsx               (NEW)
│   ├── account/
│   │   ├── page.tsx                      (NEW — settings)
│   │   └── billing/page.tsx              (NEW)
│   ├── billing/
│   │   ├── success/page.tsx              (NEW)
│   │   └── cancel/page.tsx               (NEW)
│   ├── pricing/page.tsx                  (NEW)
│   ├── terms/page.tsx                    (NEW)
│   ├── privacy/page.tsx                  (NEW)
│   └── app/page.tsx                      (was: page.tsx — main app moved under /app)
├── lib/
│   ├── sessions.ts                       (NEW)
│   ├── camera-profile.ts                 (NEW)
│   ├── credits.ts                        (NEW)
│   └── quota.ts                          (updated for credits-aware logic + new tier names)
├── components/
│   ├── app/
│   │   ├── Sidebar.tsx                   (NEW)
│   │   ├── ChatComposer.tsx              (NEW)
│   │   ├── UserMessage.tsx               (NEW)
│   │   ├── AssistantResponse.tsx         (NEW — orchestrates the four states)
│   │   ├── SettingsCubes.tsx             (NEW)
│   │   ├── ResponsePanels.tsx            (NEW)
│   │   ├── ClarificationCard.tsx         (NEW)
│   │   ├── ErrorCard.tsx                 (NEW)
│   │   ├── OutOfCreditsCard.tsx          (NEW)
│   │   └── LoadingSkeleton.tsx           (NEW)
│   ├── marketing/
│   │   ├── Hero.tsx, Features.tsx, PricingCards.tsx, FAQ.tsx, Footer.tsx
│   │   └── Spotlight.tsx                 (the gold gradient effect)
│   └── shared/
│       ├── ThemeToggle.tsx
│       ├── Nav.tsx
│       └── CreditPackPicker.tsx
└── supabase/
    └── migrations/
        ├── 001_initial_schema.sql              (users, subscriptions, usage_tracking)
        ├── 002_quota_function.sql              (old quota fn)
        ├── 003_rename_tiers.sql                (NEW — rename free→snapshot etc.)
        ├── 004_camera_profiles.sql             (NEW)
        ├── 005_sessions.sql                    (NEW — sessions + session_messages)
        ├── 006_credit_balances.sql             (NEW)
        └── 007_quota_with_credits.sql          (NEW — replace quota fn)
```

---

## 9. Environment Variables (updates)

Add to v3.0:

```bash
STRIPE_PRICE_ID_PORTRAIT=price_xxx...     # renamed from STRIPE_PRICE_ID_SILVER
STRIPE_PRICE_ID_STUDIO=price_xxx...       # renamed from STRIPE_PRICE_ID_GOLD
STRIPE_PRICE_ID_CREDITS_50=price_xxx...
STRIPE_PRICE_ID_CREDITS_200=price_xxx...
STRIPE_PRICE_ID_CREDITS_500=price_xxx...

NEXT_PUBLIC_APP_URL=https://photographywhisperer.com
```

Remove deprecated env vars from v3.0: `STRIPE_PRICE_ID_SILVER`, `STRIPE_PRICE_ID_GOLD`.

---

## 10. Known Issues & Decisions (updated)

| Issue | Status | Decision |
|---|---|---|
| Tier naming | ✅ Locked | UI: Snapshot/Portrait/Studio. DB: same lowercase. Migration rename in 003. |
| Tier limits | ✅ Locked | 5 / 500 / 2000. All hard caps. Snapshot is positioned as a *trial* (~5 settings to evaluate), not an indefinite free tier. Extra credits extend beyond cap on all tiers. Adjustable in `TIER_LIMITS`. |
| Credit pack pricing | ✅ Locked | $5 / $15 / $30 for 50 / 200 / 500 credits. |
| Pricing | ✅ Locked | $0 / $14 / $39 monthly for Snapshot / Portrait / Studio. |
| Multi-turn | ✅ Defined as Option C | Single-shot agent, client-side concat of prior turn, 1-turn lookback cap. |
| Sessions | ✅ Defined | UI grouping backed by `sessions` + `session_messages` tables. Server-side write inside `/api/settings`. |
| Camera profile | ✅ Defined | New `camera_profiles` table. Injected into every request. Optional. |
| Extra credits | ✅ Defined | One-time-purchase packs via Stripe. Don't expire. Consumed after monthly tier quota. |
| Magic link | ✅ Defined | Enabled in Supabase Auth. Secondary to password on desktop, co-equal on mobile. |
| Session rename / delete | ✅ Excluded | Per user decision. Not in v1. |
| Share / export response | ✅ Excluded | Per user decision. |
| Streaming responses | ⚠️ v1.1 candidate | Skeleton loading state in v1; progressive fill in v1.1. |
| Free-tier history cap | ✅ Defined | Snapshot users see last 3 sessions; full log persists; upgrade reveals all. Enforced at API list endpoint. |
| Cookie consent | ⚠️ Phase 10 | Add minimal banner for EU compliance. |

---

## Appendix A: Changes from v3.0

1. **Tier rename:** `free/silver/gold` → `snapshot/portrait/studio` in both DB enum and UI.
2. **Multi-turn UX:** added as Option C (client-side context concat). Agent remains single-shot.
3. **Sessions tables:** new `sessions` and `session_messages` tables. `/api/settings` writes to them post-success.
4. **Camera profiles:** new table + API routes + classifier prompt injection.
5. **Extra credits:** new `credit_balances` table, new Stripe credit-pack products, quota function rewritten to consume credits after tier quota.
6. **Magic link auth:** added secondary path.
7. **API additions:** `/api/sessions`, `/api/sessions/:id`, `/api/camera-profile`, `/api/credits`, `/api/stripe/checkout/credits`.
8. **API change:** `/api/settings` now accepts `session_id` and `prior_context`, returns `session_id`, `credits_used`, `monthly_count`, `credits_remaining`.
9. **Repo structure expanded** with auth, account, billing, onboarding, marketing pages and supporting components.
10. **Build phase map** updated — see `build-steps-v2.md`.
