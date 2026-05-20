# PhotoWhisperer — Screen Spec v1

**Status:** Source of truth for Phase 9 frontend build.
**Scope:** Every screen, every state, desktop and mobile.
**Arch reference:** `arch-spec-v3.1.md` — read it first.
**Build reference:** `build-steps-v2.md` — Phase 9 sub-phases map to this doc.

---

## 0. Design Language (locked from preview)

**Type:** Fraunces (display serif), Geist (sans body), JetBrains Mono (camera values and any numeric data).

**Color tokens:** Defined as CSS variables in the preview HTML and not duplicated here. Dark theme is default (navy + gold); light theme is warm cream + dark amber; persist via `localStorage` key `pw-theme`.

**Spacing:** 4/8/12/16/24/32/48/64 px scale. Border radius 10–14px on interactive elements, 20px on cards.

**Motion:** All transitions 200–400ms `cubic-bezier(0.16, 1, 0.3, 1)` (the spotlight easing). No motion-on-load tricks; respect `prefers-reduced-motion`.

**The Spotlight:** The radial gold gradient that follows scroll on marketing pages is part of the brand. It must not appear inside the app shell — only on public pages — or it reads as decoration competing with content.

**Tier naming:** UI surfaces `Snapshot / Portrait / Studio`. DB enum stores `snapshot / portrait / studio` (renamed from `free/silver/gold` — see arch spec). Never expose the enum to users.

**Tier limits (locked):** Snapshot 5/mo, Portrait 500/mo, Studio 2000/mo. All three are hard caps. Snapshot is positioned as a *trial*, not an indefinite free tier — marketing copy must reflect this honestly or users feel bait-and-switched. All tiers (including Studio) can hit the out-of-credits state and extend via extra credit packs. The soft warning at 80% (§4.10) fires at request 4 of 5 for Snapshot — still useful, gives the user one more shot before the wall. Adjustable via `TIER_LIMITS` constant. If you change these, update marketing copy on landing + pricing simultaneously or you'll have inconsistent claims live.

---

## 1. MARKETING

### 1.1 Landing page (`/`)

**Desktop**

Top nav: logo left, links (Features / Pricing / FAQ) center-right, theme toggle and "Sign in" ghost button right, "Get my settings" gold primary button as the sole conversion CTA. Nav is sticky with backdrop blur.

Hero section: large Fraunces headline ("Describe the scene. Get the camera settings."), one-line subhead naming the four outputs (ISO, aperture, shutter, white balance), the "Get my settings" gold button, and a small line of micro-copy beneath ("Try 5 free settings, no card required"). Spotlight gradient sits behind, anchored top-center.

Features strip (three columns at desktop): "Works for any camera" / "Calculates real exposure math, not vibes" / "Built for the field." Each card uses a small Fraunces heading, two sentences of Geist body, and an icon in gold. Spotlight shifts right-of-center while this section is dominant.

How-it-works strip: three numbered steps with a screenshot of an actual response rendered in the app's visual style. Steps are "Describe the scene → Read the settings → Dial them in." The screenshot must be a real response shape (4 cubes + 3 panels) not a mock, so visitors see exactly what they're buying.

Pricing section (anchor `#pricing`): three cards side-by-side. Snapshot left, Portrait center (highlighted with gold border and "Most popular" pill), Studio right. Each card: tier name in Fraunces, price in JetBrains Mono ("$0", "$14", "$39") with `/month` in muted text, the request quota as the lede feature, then 3–4 supporting features beneath, then a button — "Start free" / "Get Portrait" / "Get Studio." Below pricing, a one-line note: "Need more? Buy extra credits anytime from your billing page."

FAQ section: accordion with at minimum these questions — Does this work with my camera? Do I need to know exposure math? What counts as one setting? Can I cancel anytime? Do you store my data? Do my unused requests roll over? (Answer: no, they reset on the 1st UTC; extra credits do roll over.) Open one item by default to signal interactivity.

Footer: logo, three columns (Product / Company / Legal), small social icons, copyright. Theme toggle duplicated bottom-right of footer.

**Mobile**

Nav collapses to: logo left, hamburger right. Hamburger opens a full-screen overlay with links stacked vertically, theme toggle at top of overlay, "Sign in" and "Get my settings" buttons at bottom of overlay (thumb-reachable). Spotlight is still present but smaller and lower-opacity so it doesn't tint photographs in screenshots above the fold.

Hero stacks vertically with reduced font sizes (headline ~36px, not 64px). Buttons go full-width minus 32px gutter. Features strip becomes a single column. Pricing cards become a horizontal swipeable carousel with snap points, Portrait card centered by default. FAQ accordion behaves identically. Footer columns collapse into a single column.

**Success:** visitor taps "Get my settings" or a pricing-tier button. Tier button routes to `/signup?tier=portrait` and signup remembers the choice through Stripe Checkout.

**Failure modes:** images don't lazy-load on slow connections (set Lighthouse budget at PR time); spotlight gradient kills paint performance on low-end Android (gate it behind `prefers-reduced-motion: no-preference`); the pricing carousel on mobile loses the "most popular" emphasis when Portrait isn't centered — fix by snapping to Portrait on mount.

**Edge cases:** logged-in visitor on landing — replace "Sign in" with "Open app" and "Get my settings" with "New scene" so the nav reflects their state; tier-CTA click from logged-in user with that exact tier active — route to billing, not signup.

### 1.2 Pricing page (`/pricing`)

A dedicated page mirroring the landing pricing section, with deeper comparison: a feature matrix table (rows = features, columns = tiers, cells = ✓ / value / —). Features compared: monthly requests, request rollover (none), history (3 sessions / unlimited / unlimited), camera profile editing, priority support, extra-credit packs available. Adds a small FAQ-style block beneath the table: "What happens if I run out?" → buy credits or upgrade; "Can I downgrade?" → yes via customer portal, takes effect at period end.

**Mobile:** the feature matrix horizontally scrolls inside its own container rather than collapsing into stacked cards (which destroys comparability).

### 1.3 Terms (`/terms`) and Privacy (`/privacy`)

Long-form pages, single column max-width 720px, Fraunces H1 + H2, Geist body at 17px/1.65, JetBrains Mono for any inline code or dates. A sticky right-rail table of contents at desktop widths ≥1100px; collapse to a top-of-page floating "Jump to section" dropdown on mobile.

Last-updated date in muted text at the top. Privacy must disclose: Supabase as data processor, Stripe for payments, Anthropic processes scene descriptions, no retention of scene text beyond what's needed for history (which the user controls), no training data sharing.

**Edge case:** the page is reachable by web crawlers and law firms looking for ammunition. Don't write cute. Plain English, correct claims, contact email.

### 1.4 404 (`/404`)

Centered card on the dark navy background with the spotlight gradient overhead. Fraunces heading ("Off the focal plane"), one-line subhead ("That page doesn't exist."), two buttons: "Back to home" (primary gold) and "Back to app" (outline, visible only if logged in). A small Geist line beneath: "If you followed a link from us, sorry — let us know at support@photographywhisperer.com."

Log the 404 with the requested URL to your analytics or Sentry; broken inbound links from your own marketing should be fixed at the source.

**Mobile:** same layout, buttons full-width.

---

## 2. AUTH

### 2.1 Sign up (`/auth/signup`)

**Desktop**

Two-column layout at ≥1024px: left column is the form card (max 420px wide), right column is a quiet brand panel with a single rotating quote ("Got the bird-in-flight shot on the first try" / "Saved me re-reading my exposure book — again"). The right panel is decoration; don't put critical functionality there.

Form card contents: logo top, "Create your account" Fraunces heading, three fields in order — Email (with inline validation on blur), Password (with reveal-eye icon and a 3-segment strength meter that fills as the password gets stronger), and a hidden-by-default "Have a referral or promo code?" disclosure link that expands to a single input. Below: a primary gold "Create account" button full-width, an "or" divider, and a secondary outline "Email me a sign-in link" button (magic link path — sends to sign-in flow because magic-link signup is the same as magic-link sign-in for new emails).

Beneath the buttons: "By signing up you agree to our [Terms] and [Privacy]" in muted text with the links underlined. At the very bottom: "Already have an account? [Sign in]."

If the user arrived from `/signup?tier=portrait` or `?tier=studio`, a thin banner at top of the card reads: "Starting with Portrait — payment after this step" with the tier name in gold. If they arrived from the free tier or with no tier param, no banner.

**Mobile**

Single column, brand panel hidden. Form card occupies the full viewport with 24px horizontal padding. Field heights bump to 52px minimum for thumb reach. The "Email me a sign-in link" button stays equally prominent — on mobile, magic link is often the better path for users who hate typing passwords on tiny keyboards.

**Success:** Supabase creates the user, email verification is sent automatically, user is routed to `/auth/verify-email` interstitial.

**Failure modes:**
- Email already registered → inline error reading "An account already uses that email. [Sign in instead]" — never a generic "something went wrong."
- Weak password → strength meter shows red, helper text explains why ("8+ characters, one number recommended"). Don't block submission on subjective strength; only block on Supabase's enforced rule (8+ chars).
- Invalid email format → inline on blur, not on submit.
- Supabase rate-limit on the signup endpoint (>10 attempts from one IP per hour) → friendly "Too many signup attempts. Try again in a few minutes."
- Magic-link path used for an already-registered email → still send the magic link; on click, user signs into existing account. Don't reveal "that email is taken" to avoid enumeration.

**Edge cases:**
- User navigates back to signup after creating account → they're already authenticated; redirect to `/app`.
- User opens signup in two tabs and submits both → second submission fails with "already registered"; treat as the success path on the first tab.
- Disposable email domains — out of scope for v1, but flag for v1.1 if abuse appears.

### 2.2 Sign in (`/auth/signin`)

Same visual language as signup. Form card: logo, "Welcome back" Fraunces heading, Email and Password fields, a "Forgot password?" muted link beneath the password field, primary gold "Sign in" button, "or" divider, secondary outline "Email me a sign-in link" button. Beneath: "No account? [Sign up]."

Password is primary, magic link is secondary on desktop. On mobile, both buttons are equally weighted because magic link is genuinely better there.

**Success:** routed to `/app` and the last-visited session if any, or new scene composer otherwise.

**Failure modes:**
- Wrong credentials → "Email or password doesn't match." Do NOT distinguish "no account" from "wrong password." Anti-enumeration.
- Unverified email → "Please verify your email first. [Resend link]" with a 30-second cooldown on resend.
- Account flagged or locked by Supabase rate-limit → "Account temporarily locked. Try again in 15 minutes or reset your password."
- Subscription expired or canceled → still sign in successfully; surface the state via a non-dismissable banner in the app routing to billing.

**Edge case:** signin success but profile/subscription row missing from `public.users` or `public.subscriptions` (DB migration bug or trigger failure) → don't crash, surface a banner: "Setting up your account…" and re-run the user-creation trigger from a server endpoint.

### 2.3 Magic link sent (`/auth/check-email`)

Interstitial after either signup or magic-link sign-in request. Centered card: Fraunces heading "Check your email", a paragraph "We sent a sign-in link to [email]. Click it to continue.", a "Resend email" outline button with 30-second cooldown shown as a countdown ("Resend in 0:25"), a "Change email" text link beneath, and a "Open Gmail" / "Open Outlook" shortcut row (just two buttons opening webmail in a new tab — small UX win that matters).

**Edge case:** user closes the tab and clicks the link later from a different device — Supabase handles the auth on whichever device opens the link.

### 2.4 Magic link callback (`/auth/callback`)

A near-invisible loading state — spinner and one line of Fraunces text "Signing you in…" — that processes the redirect token from the email link. On success, route to `/app` (or to onboarding if it's the user's first sign-in and they haven't completed camera profile). On failure (expired link, tampered token, already used), route to `/auth/signin` with a banner reading "Link expired — try again."

### 2.5 Email verification interstitial (`/auth/verify-email`)

Identical layout to magic link sent, but copy differs: heading "Verify your email", body "We sent a verification link to [email]. Click it to start using PhotoWhisperer." The verification email's link points to `/auth/callback?type=verify` which marks the email as verified and routes to onboarding.

### 2.6 Password reset request (`/auth/reset`)

Minimal card: heading "Reset your password", single Email field, primary "Send reset link" button, "Back to sign in" muted link beneath. On submission, regardless of whether the email exists, show the same confirmation state: heading "Check your email", body "If an account exists for that email, we sent a reset link. The link expires in 1 hour." Anti-enumeration is more important here than helpful error messaging.

### 2.7 Password reset completion (`/auth/reset/confirm?token=…`)

The user clicked the link in email. Card with two fields: New password (with strength meter and reveal-eye), Confirm new password (must match — inline validation on blur). Primary "Set new password" button. On success, auto-sign-in and route to `/app`.

**Failure modes:**
- Token expired → "This link expired. [Request a new one]" routing back to reset request.
- Token already used → same as above.
- Passwords don't match → inline error on the confirm field, don't block typing.

---

## 3. ONBOARDING

### 3.1 Camera profile capture (`/onboarding/camera`)

**Desktop**

Centered full-page modal-like flow with a progress dots indicator at top (3 steps: Body → Lenses → Done). Each step has a Fraunces heading, a one-line muted helper, the input control, and two buttons at the bottom: "Skip" (text-only, left-aligned) and "Continue" or "Save" (gold primary, right-aligned).

**Step 1 — Body:** Heading "What do you shoot on?" Body select: a searchable autocomplete dropdown listing common bodies (Canon R6, R5, Sony A7 IV, A7 III, Fuji X-T5, X-T4, Nikon Z6, Z7, iPhone 15 Pro, 14 Pro, etc.). Selection sets the body. There's also a "My camera isn't listed" link beneath that switches to a free-text input field. A "Skip" option at any point lands the user in the app with a banner reading "Add your camera anytime in Settings for more accurate advice."

**Step 2 — Lenses:** Heading "Which lenses?" Multi-select with the same autocomplete pattern, filtered by mount inferred from the chosen body when possible. User can add multiple. A "Skip" option works.

**Step 3 — Done:** Heading "You're set." Summary card showing body + lenses, with an "Edit" link routing to settings. Primary button "Start shooting" routes to `/app`.

**Mobile**

Each step is a full-screen view (no modal framing). Autocomplete uses a native-feeling bottom sheet rather than a floating dropdown. Skip and Continue buttons sit at the bottom of the viewport, full-width-minus-gutter, stacked with Continue on top.

**Success:** profile saved to `camera_profiles` table, user lands in app with relevant context loaded into client state for future `/api/settings` calls.

**Failure modes:** save fails → toast at bottom, "Couldn't save your profile. [Retry] or [Skip for now]." Don't block proceeding.

**Edge cases:**
- User picks a body the agent doesn't recognize → treat as a hint, not a constraint; the classifier prompt will say "treat unknown gear as a hint."
- User completes onboarding then later removes all camera info → on next request, classifier reverts to its generic assumptions and surfaces "focal length assumed" in the assumptions panel.

---

## 4. APP

### 4.1 App shell (always present)

**Desktop**

Two-pane layout: left sidebar (260px fixed width), main chat area (fluid, max-width 880px centered). Sidebar contains:
- Top: logo + "New scene" gold primary button full-width
- Heading "Recent sessions" muted small caps
- List of past sessions for this user (last 3 if Snapshot tier, unlimited if Portrait/Studio), each row showing the auto-generated title and a timestamp in muted JetBrains Mono. Active session has a gold left-border and slightly elevated surface.
- (For Snapshot tier only) a teaser card beneath the 3 visible sessions: "Your earlier sessions are saved — [Upgrade] to access them all"
- "Coming soon" section (cosmetic only): three locked items (Taking photos, Editing, AI enhancement) each rendered at reduced opacity with a "soon" pill. Not interactive.
- Bottom: a credits/quota block showing usage as `312 / 500` with a horizontal progress bar in gold; a "+" icon-button at the right of the credits label opens the extra credits purchase modal; an "Upgrade to Studio" gold-outlined CTA below; an account row with avatar, name, tier name, and small icon buttons for theme toggle and settings.

Main area contains the active session — composer at bottom, messages stacked above, scroll inside the area rather than the page.

A "Untitled session" auto-title appears at the top of the chat area until the AI has generated a title from the first response's scene_summary.

**Mobile**

The sidebar is hidden by default; a hamburger button sits at the top-left of the chat area (above the chat title or in a slim top bar). Tapping it opens the sidebar as a full-screen overlay drawer that animates in from the left. When the drawer is open, the chat area is hidden (per your spec — the drawer takes the whole screen when open).

When the drawer is closed, only the chat area is visible: full width, with a thin top bar containing hamburger + chat title + a kebab menu (for any session-level actions — currently empty, future-reserved). Composer pins to the bottom of the viewport above the OS keyboard when input is focused.

The credits block, upgrade CTA, and account row inside the drawer follow the same layout as desktop but full-width.

**Success:** every navigation pattern from the sidebar (new scene, jump to past session, open settings, toggle theme, buy credits, upgrade) works from both desktop and mobile.

**Failure modes:**
- Sidebar tries to render >3 sessions for a Snapshot user → enforce the limit at the API list endpoint, not just in UI. UI is presentation; security is server.
- Credits bar shows nonsensical fractions when extra credits are involved → render as `used / (tier_limit + extra_credits)` so the math always adds up.
- Long session titles overflow the sidebar → truncate to ~28 chars with ellipsis, full title on hover (desktop) or long-press tooltip (mobile).

**Edge case:** brand-new user with zero sessions → sidebar shows only "New scene" button, an empty state in the recent sessions list ("Your sessions will appear here"), and the coming-soon block. No upgrade teaser yet — they need to feel the value before being asked to pay.

### 4.2 New scene — empty composer state

The chat area for a fresh session. Centered above the composer: a Fraunces heading "What are you shooting?" (or a similar one-liner — "What's the scene?" is the alternate). Beneath the heading, a row of 3–4 example prompt chips that pre-fill the composer on tap. Suggested chips for v1:
- "Backlit portrait at golden hour, 85mm, handheld"
- "Indoor newborn near a north-facing window"
- "Bird in flight, overcast, 400mm"
- "Long exposure waterfall on a tripod"

These need to reflect what your calculator actually handles well — pick scenes that show off the breadth.

The composer itself is pinned to the bottom of the chat area: a tall rounded input (min height 56px, grows with content up to 5 lines), a placeholder reading "Describe your shot — light, subject, lens, mood…", and a gold send button on the right (paper-plane icon). Disabled when input is empty.

**Mobile:** the chips wrap onto multiple lines if needed. The composer pins above the on-screen keyboard.

**Failure modes:** composer is empty and send is hit (e.g., keyboard accelerator) → noop with subtle shake animation, no error toast.

**Edge case:** Snapshot user at 0 remaining requests → composer is disabled with grayed background and a small inline message "You've used your 5 free settings. [Buy credits] or [Upgrade] to keep shooting." Chips are also disabled.

### 4.3 Active session — user message just sent

User taps send. The message appears right-aligned in the scroll area as a gold-tinted surface bubble (subtle, not aggressive — a hint of the accent), in Geist body, with text-align left inside the bubble. The composer clears and is briefly disabled (greyed send button, input still focused but uneditable) until the AI response begins to appear.

The user message bubble has a soft drop shadow and a max-width of 75% of the chat area. Long messages wrap normally.

### 4.4 Active session — AI thinking / loading state

Where the AI response will render, a placeholder block appears: the small AI header "PhotoWhisperer · thinking…" with the gold pulsing dot, and four skeleton cubes in the grid layout (same dimensions as the real cubes but with no content — animated shimmer or pulse). Below the skeleton cubes, three skeleton panels (full-width summary, narrow assumptions, narrow warnings).

**After 8 seconds:** the header text changes to "Still thinking…". **After 20 seconds:** a retry button appears beneath the skeleton with "Take longer than expected? [Retry]". **After 30 seconds:** the request is aborted client-side and the error state takes over (4.8).

**Streaming consideration:** if Anthropic streaming is enabled in v1.1+, the scene_summary panel fills in first (the easiest content to stream), then cubes fill in one at a time, then assumptions and warnings. The skeleton remains for whatever hasn't streamed yet. For v1 without streaming, the whole response replaces the skeleton at once.

**Mobile:** identical skeleton layout but cubes are 2×2 grid, panels stacked full-width.

### 4.5 Active session — full AI response (status: ok)

The AI message renders left-aligned with no bubble background — it's the page's natural surface. Above the content, the small AI header: a gold pulsing dot (now static), "PhotoWhisperer · settings ready", and a timestamp in muted JetBrains Mono.

**Cubes:** four cubes in a row at desktop (each ~180px wide), wrapping to 2×2 at tablet, stacking to 1×4 on small mobile. Each cube has:
- Top: cube label in muted small caps ("ISO", "Aperture", "Shutter", "White Balance")
- Middle: cube value in large Fraunces or JetBrains Mono (the numeric part) — value style depends on cube, see 4.5.1 below
- Bottom: one-sentence hint in Geist body 13px, muted text color, line-height 1.5

Each cube has a 1px border in `border-accent` (warm gold-tinted), 14px border radius, 16px internal padding. On tap (mobile) or click (desktop), the cube subtly highlights and copies the value to clipboard with a small floating toast ("Copied f/2.8").

**4.5.1 — Cube value states**

ISO cube: value is a number, rendered in JetBrains Mono at ~36px. Example "200" or "1600". Hint explains why.

Aperture cube: value is "f/" prefix in slightly smaller mono + the number in larger mono. Example "f/2.8". Hint explains creative or technical rationale.

Shutter cube: two display variants — for shutters ≥1 second, render as `2"` (quote mark for seconds), at ~36px mono. For shutters <1 second, render as `1/` in smaller mono + the denominator at ~36px mono, with a tiny `s` suffix in muted text. Hint explains motion-stop or shake floor.

White Balance cube — **three states (per your decision):**
1. **Numeric + enum (most common):** value is "5500K" or "6500K" in 36px mono. Beneath the value, in muted Geist 12px, the enum label ("Daylight" / "Cloudy" / "Shade" / "Tungsten" / "Fluorescent" / "Flash"). Hint says something like "Or set 'Cloudy' preset on your camera."
2. **Auto-only:** value is just the word "Auto" in 28px Fraunces (slightly smaller than numeric since it's a word). No kelvin shown. Hint says "Mixed lighting — let the camera handle this one."
3. **Flash:** identical to state 1, with kelvin around 5500K and enum "Flash." Hint mentions flash sync caveats if the calculator clamped shutter to 1/200.

The cube width is uniform across all three states; vertical alignment of the value is centered to prevent jumpy layouts when comparing past sessions.

**Panels (below the cubes):**

Three panels in a row at desktop (or one full-width + two half-width — match the preview HTML which has Scene Summary full-width on top, then Assumptions and Warnings half-width below).

- **Scene Summary** (always present): small icon (info circle) + label in muted small caps, then a 1–3 sentence body in Geist 15px. Uses bold sparingly for key terms.
- **Assumptions** (present if `assumptions[]` non-empty): checkmark icon + label, body lists assumptions joined by ` · ` separator inline (not bulleted) for compactness. If `focal_length_assumed: true` is in the classifier output, the assumptions array should contain a string explicitly calling it out.
- **Warnings** (present only if `warnings[]` non-empty): triangle warning icon + label, body lists warnings joined by ` · ` separator. Panel uses a warm-amber tint on the border to distinguish from neutral panels. If no warnings, this panel does not render — don't show an empty "no warnings" panel.

**Action row beneath the panels:**
- "Refine" button (outline, gold border): pre-fills the composer with a refinement starter ("Same scene but…") and focuses the input. See 4.7 for refinement flow.
- "Copy all" button (outline): copies a formatted text block to clipboard ("ISO 200 · f/2.0 · 1/500 · 5500K (Cloudy)") with a toast confirmation.
- Thumbs up / thumbs down icon-buttons (ghost): fire a `response_rating` event to analytics. Don't open a modal for the thumbs-down in v1 — just record the signal. v1.1 can add a comment field.

**Mobile:** action row buttons stretch full-width-minus-gutter, stacked. Cubes go 2×2. Panels stack full-width.

### 4.6 Active session — clarification_required state

When the classifier returns `{ status: "clarification_required", question: "…" }`, render in place of the cubes+panels: a single panel with a question-mark icon, label "Need a bit more info", and the question in Fraunces 18px. Below the question, the composer is auto-focused. **Do not** decrement quota for clarifications (already specced in arch).

Critically: the user's response to a clarification is **a new isolated `/api/settings` request** under Option C, but the frontend silently concatenates the prior user message + the AI's question + the user's new answer into one fuller `conditions` string before sending. The agent sees one bigger prompt; the UI shows the threaded back-and-forth.

**Failure mode:** classifier asks more than 2 clarifications in a row → frontend tracks consecutive clarifications on the current session; after 2, suppress the next clarification by sending a tweaked prompt that says "do your best with what's stated" and accept whatever the agent returns.

**Edge case:** user ignores the clarification and types a fresh unrelated scene → treat as a new request, NOT a continuation. Detect by simple heuristic: if user's new message doesn't reference any of the clarification's keywords, drop the concat and send the new message alone.

### 4.7 Active session — refinement flow (Option C in practice)

Tapping "Refine" on a prior response pre-fills the composer with "Same scene but " and focuses the input. User completes the sentence ("...darker mood" or "...without a tripod") and sends.

Frontend concatenates: prior user prompt + prior AI scene_summary + new refinement instruction, like:

```
[Original]: Shooting a friend's outdoor proposal at golden hour, 85mm, sun behind.
[Settings I got]: ISO 200, f/2.0, 1/500, 5500K. Scene summary: Sun roughly 30min before sunset...
[Refinement]: Same scene but I don't have a tripod — needs to be fully handheld.
```

This synthetic concatenation is sent as a single new `conditions` string to `/api/settings`. Quota is consumed. The new response renders as the next AI message in the thread.

**Cap on history depth:** only the immediately prior user+AI pair is included in the concat. Going further back makes prompts long and unpredictable. Document this in the implementation guide.

**Mobile:** Refine button works the same; composer auto-focuses (assuming keyboard pops up).

### 4.8 Active session — error state (status: error)

API call failed (network, timeout, classifier parse fail, validation fail). Render in place of cubes+panels: a single panel with a warning icon, label "Something went sideways", body explaining what we can say without leaking internals ("Couldn't reach the photography service. Try again?"), and a primary outline "Retry" button. Retry re-sends the same `conditions` payload **without consuming quota again** (the original request didn't increment quota because status wasn't ok).

After 3 consecutive retries fail, the retry button is replaced with "Still failing? [Report a problem]" linking to a mailto or a simple feedback form.

**Edge case:** error during refinement → the synthetic concatenated prompt is preserved so retry uses the same context.

### 4.9 Active session — invalid_input state

Classifier returns `{ status: "invalid_input", message: "Please describe your shooting conditions: lighting, subject, and movement." }`. Render as a panel with a question-mark icon, label "Not quite enough to go on", and the message text. Composer is auto-focused so the user can try again.

Quota is **not** consumed (already specced).

**Edge case:** user types pure gibberish multiple times → after 3 invalid_input responses in a row, surface a help link: "[See examples]" opening a modal or scrolling to the chip suggestions from the empty state.

### 4.10 Out-of-credits state (hard cap reached)

When tier monthly quota is exhausted AND extra credits balance is zero, the composer is disabled and replaced with a full-width inline notice card: warning icon, Fraunces heading "That's your free trial", body "You've used 5 of 5 Snapshot requests — and you have no extra credits. Pick up where you left off with a credit pack, or upgrade to Portrait for 500/month.", and two buttons: "Buy extra credits" (primary gold) and "Upgrade plan" (outline). For Portrait/Studio users who hit their own monthly limit, the heading becomes "You've hit your monthly limit" and the copy references their tier numbers and the next reset date.

The user can still scroll past sessions and read their existing responses. The sidebar is unchanged.

**Soft warning state (at 80% of tier limit):** A non-blocking dismissable banner appears above the composer reading "You've used N of M requests this month. [Upgrade] or [Buy credits] to extend." For Snapshot specifically the math fires at 4 of 5 — one shot left, which is exactly when the nudge has bite. Dismissible per session.

**Mobile:** identical layout, buttons full-width and stacked.

### 4.11 Rate-limited state (per-minute)

If the user hits the per-minute rate limit (10 req/min per arch spec), the composer briefly disables for the remaining cooldown with an inline message "Easy — give us 20 seconds and try again." A visible countdown ticks down. After cooldown, the composer re-enables automatically.

This is rare in normal use and should feel like a gentle pause, not a punishment.

---

## 5. ACCOUNT

### 5.1 Account / Settings page (`/account`)

**Desktop**

Two-pane layout: left rail with section tabs (Profile / Camera / Preferences / Security / Danger Zone), right pane with the active section's form. Sticky-save bar at the bottom that appears when the active section has unsaved changes — "You have unsaved changes" muted text, "Discard" outline button, "Save changes" gold primary.

**Profile section:** Email field (read-only with an "Edit" button that opens a "Change email" modal — change requires verification of the new address before it takes effect; old email remains active until verified), display name field (optional, currently no UI elsewhere uses display name beyond the avatar initials, but reserved).

**Camera section:** the camera profile from onboarding, fully editable. Body field, lenses multi-select, flash dropdown (None / Speedlight / Studio strobe). A "What is this used for?" disclosure explains briefly: "We send your gear to the AI on each request to keep recommendations executable on your kit."

**Preferences section:** Theme toggle (Dark / Light / System), Default focal length (optional, applied when no focal cue is in the prompt — a small UX win for users who always shoot 50mm), product email opt-in/opt-out checkboxes.

**Security section:** Change password (current password + new password + confirm), Active sessions list (Supabase-tracked, each row with device hint + last-seen + a "Sign out" button per session), "Sign out everywhere" button.

**Danger Zone section:** at the bottom, visually separated with a warm-amber border. Contains "Export my data" (downloads a JSON file with their sessions, profile, and billing info — a soft-GDPR move that costs little and signals trust) and "Delete account" (opens a typed-confirmation modal: "Type DELETE to confirm — this is permanent after a 7-day grace period.").

**Mobile**

The left rail collapses into a top horizontal scroll of section tabs. Form content fills the screen. Sticky save bar pins to the bottom.

**Failure modes:** save fails network-side → keep the unsaved-changes bar visible with an error toast; don't silently discard the user's edits. Email change with already-taken target → inline error.

**Edge cases:** user changes email then never verifies → after 30 days, surface a banner "Pending email change — verify or cancel." Sessions list on a long-lived account → paginate after 50 sessions.

### 5.2 Billing page (`/account/billing`)

**Desktop**

Single column, max-width 720px. Sections stacked top to bottom:

**Current plan section:** card showing tier name in Fraunces, monthly price in mono, renewal date or "Free — no renewal" line. Two buttons: "Change plan" (opens Stripe customer portal) and "Cancel" (also customer portal). For Snapshot users, the section shows "You're on Snapshot — free forever. Upgrade for more requests." with an "Upgrade" gold button instead.

**Usage section:** the same usage block from the sidebar but expanded — a larger progress bar, breakdown showing `X used of Y monthly + Z extra credits = W total remaining`, and the reset date in muted text. If the user has any extra credits, an "Extra credits" sub-line shows the balance and a "Buy more" outline button.

**Extra credits section:** card with heading "Need more requests?", body explaining the credit-pack model (one-time purchase, doesn't expire, used after monthly quota), and three pack options as smaller cards: e.g., 50 credits / $5, 200 credits / $15, 500 credits / $30. Pack pricing is your call; flag for finalization before Phase 8. Each card has a "Buy" button that opens Stripe Checkout.

**Payment method section:** read from Stripe, shows card last-4 + brand, "Update" button opens customer portal. Only shown for paying tiers.

**Invoice history section:** table with date, amount, status, "Download" PDF link per row. Empty state for Snapshot users.

**Mobile**

Single column already; sections stack. Pack cards become a vertical list. Invoice table becomes a stacked list of rows.

**Failure modes:**
- Stripe webhook delayed → recent purchase doesn't show on this page yet → "Recent activity may take a few minutes to appear" muted line at top of invoice history.
- Payment method invalid (card expired) → red banner at top of page: "Your payment method failed — [Update card]."

**Edge case:** subscription is `past_due` → app-wide non-dismissable banner appears (not just on billing) reading "Payment failed — [Update payment] to keep Portrait." Grace period before downgrade to Snapshot is 7 days, per Stripe webhook handling.

### 5.3 Extra credits purchase modal

Triggered by the "+" icon in the sidebar credits block, or by the "Buy extra credits" buttons elsewhere. Modal overlay with three pack cards (same as billing page), a one-line note "Credits don't expire and are used after your monthly quota," and a "Cancel" link. Each "Buy" button routes to Stripe Checkout configured for one-time payment with the credit_amount in metadata.

On Stripe Checkout return success, the webhook handler increments the user's `credit_balances.credits_remaining`. The modal closes and a toast confirms "Added 200 credits."

**Mobile:** the modal becomes a full-screen sheet with the same content.

**Failure modes:** Stripe Checkout cancel → toast "Purchase canceled. No charges made." Webhook lag on credit grant → the credits don't appear immediately; show "Processing — credits will appear in a few seconds" until the GET on credits returns the new balance (poll for 30s, then fall back to "Refresh to check").

### 5.4 Stripe checkout return — success (`/billing/success`)

Brief page reading "You're on Portrait" (or "Credits added" for credit packs), confirmation icon, and a single "Continue to app" gold button. Page auto-redirects to `/app` after 4 seconds if no interaction. Server-side, the webhook should have already fired and updated the subscription or credit balance; this page is just confirmation.

### 5.5 Stripe checkout return — cancel (`/billing/cancel`)

"Purchase canceled" with a small icon, "No charges were made" body, and two buttons: "Back to billing" outline and "Back to app" primary. Optionally one survey question: "Why did you change your mind?" with four radio options (Too expensive / Need different features / Just exploring / Other) — completely optional, click "Skip" to dismiss. Survey data fires to analytics, not stored against the user.

---

## 6. MOBILE-SPECIFIC NOTES

These are not separate screens but cross-cutting behaviors flagged in your message.

**Sidebar collapse pattern (per your decision):**
- Default state: sidebar hidden, only chat area visible.
- Open state: sidebar takes the full screen as an overlay drawer, chat area is hidden behind it.
- Transition: drawer slides in from left over 280ms ease-out. Backdrop fades from 0 to 0.5 opacity at the same time.
- Dismiss: tap outside the drawer area (i.e., the backdrop) OR swipe-from-right-edge on the drawer itself. Both should work.
- Hamburger button position: top-left of the chat area top bar, 44×44px tap target minimum.

**Composer behavior on mobile:**
- Pins to bottom of viewport.
- On focus, the on-screen keyboard pushes the composer up; the chat area scrolls so the latest message stays in view above the keyboard.
- The send button stays the same size, gold, with a paper-plane icon. No "Send" text label on mobile (icon-only saves space).

**Cube tap behavior on mobile:**
- Tap copies value to clipboard with a floating toast.
- Long-press doesn't do anything in v1 (reserve for v1.1 — could open value details or context).

**Pricing carousel on mobile:**
- Snap-points center each card. Portrait card centered by default. Swipe between cards horizontally.
- Three dot-indicators below the carousel show which card is centered.

**Form keyboards:**
- Email fields trigger email keyboard (`type="email"`).
- Numeric-only fields trigger numeric keyboard (`inputmode="numeric"`).
- Don't autocomplete sensitive fields incorrectly: password fields use `autocomplete="current-password"` or `"new-password"` as appropriate.

**Touch targets:**
- 44×44px minimum for all interactive elements.
- 8px minimum gap between adjacent tappable elements to prevent fat-finger mis-taps.

**Reduced motion:**
- Spotlight gradient on marketing pages becomes static (positioned but not animating) when `prefers-reduced-motion: reduce`.
- All page transitions become instantaneous when reduced motion is set.

---

## 7. WHAT I'M NOT SPEC'ING (deliberately)

- **Streaming response UI** — your arch is single-shot non-streaming for v1. If you add streaming in v1.1, the loading state in 4.4 becomes a progressive fill.
- **Session rename / delete** — per your decision.
- **Share / export response** — per your decision.
- **Multi-user / team accounts** — not in scope.
- **Image upload in composer** — placeholder only, future feature.
- **EXIF reverse-lookup** — not in scope.
- **Admin / support views** — out of scope for v1.
- **Cookie consent banner** — flagged but not detailed; required for EU traffic. Add a minimal banner in Phase 10.
- **Maintenance / status page** — out of scope for v1; if Anthropic API goes down, the error state in 4.8 handles it.

---

## 8. FAILURE MODES YOU SHOULD STRESS-TEST

Before signing off on Phase 9, manually walk through:

1. Send a request, kill network mid-flight, watch the timeout and error states fire.
2. Hit monthly quota exactly, send the next request, verify the out-of-credits state is correct and quota wasn't incremented past the limit.
3. Buy extra credits, exhaust them, hit out-of-credits with `tier_limit + 0 extra` math.
4. Trigger a clarification, answer it, trigger another clarification on the same session — should auto-suppress after the second.
5. Refine a response 4 times in a row — confirm only the immediately prior turn is concatenated, not the full chain.
6. Switch theme mid-session — every surface should recolor cleanly with no flash of unstyled content.
7. Open the mobile drawer, navigate to a past session, close the drawer — verify the chat area loaded the new session correctly.
8. Sign in on mobile via magic link, complete onboarding, fire your first request — full happy path on the riskiest device.
