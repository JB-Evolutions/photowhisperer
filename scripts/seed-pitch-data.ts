// Idempotent seed for the investor-pitch screenshot pipeline (pnpm pitch:shots).
// Populates PITCH_EMAIL's account with realistic, fixed content so the
// app-settings shot never has to make a live Anthropic call — it loads a
// pre-seeded session instead, which is what makes the pipeline repeatable.
//
// Safe to run repeatedly: every write is a find-or-create / upsert against a
// fixed marker (the account's email, the session's title), never a blind
// insert.
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });

import { createClient } from "@supabase/supabase-js";
import type { SettingsResponseOk } from "../src/lib/settings";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SECRET_KEY;
const PITCH_EMAIL = process.env.PITCH_EMAIL;
const PITCH_PASSWORD = process.env.PITCH_PASSWORD;

function requireEnv(name: string, value: string | undefined): string {
  if (!value) throw new Error(`${name} must be set (in .env.local or the environment).`);
  return value;
}

const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL", SUPABASE_URL);
const serviceKey = requireEnv("SUPABASE_SECRET_KEY", SERVICE_KEY);
const email = requireEnv("PITCH_EMAIL", PITCH_EMAIL);
const password = requireEnv("PITCH_PASSWORD", PITCH_PASSWORD);

// Structural guard, not a comment: this must reject a real account's email
// before a single Supabase call is made. Either the address is tagged
// (anything+pitch@...) or it exactly matches an explicit opt-in constant —
// there is no path from "I typed my real email into PITCH_EMAIL" to a write.
const PITCH_EMAIL_TAG_PATTERN = /\+pitch@/i;
const PITCH_ALLOWED_EMAIL = process.env.PITCH_ALLOWED_EMAIL;

function assertSeedableEmail(candidate: string): void {
  const taggedMatch = PITCH_EMAIL_TAG_PATTERN.test(candidate);
  const allowlistMatch =
    PITCH_ALLOWED_EMAIL !== undefined &&
    candidate.toLowerCase() === PITCH_ALLOWED_EMAIL.toLowerCase();
  if (!taggedMatch && !allowlistMatch) {
    throw new Error(
      `Refusing to seed "${candidate}": PITCH_EMAIL must match *+pitch@* (e.g. demo+pitch@yourdomain.com) ` +
        `or exactly equal PITCH_ALLOWED_EMAIL, set explicitly in the environment. No writes were made.`,
    );
  }
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// supabase-js has no getUserByEmail on the admin API — page through
// listUsers and match client-side, falling back to createUser on a miss.
async function findOrCreateUser(): Promise<string> {
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const found = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (found) return found.id;
    if (data.users.length < 200) break;
  }

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw error;
  if (!data.user) throw new Error("createUser returned no user");
  return data.user.id;
}

// Second half of the account guard: even an email that passed
// assertSeedableEmail could in principle already resolve to a real,
// in-use account (e.g. someone else provisioned that +pitch@ address for
// real use). Both checks run against the resolved user_id, before any of
// the seedX writes below — the only session this script ever tolerates is
// its own marker row, and a paying account always has a Stripe customer id.
async function assertNoForeignSessions(userId: string): Promise<void> {
  const { data, error } = await admin
    .from("sessions")
    .select("session_id, title")
    .eq("user_id", userId);
  if (error) throw error;
  const foreign = (data ?? []).filter((s) => s.title !== SEEDED_SESSION_TITLE);
  if (foreign.length > 0) {
    throw new Error(
      `Refusing to seed user ${userId}: found ${foreign.length} session(s) not created by this script. ` +
        `This looks like a real account, not a dedicated pitch demo account. No writes were made.`,
    );
  }
}

async function assertNoStripeCustomer(userId: string): Promise<void> {
  const { data, error } = await admin
    .from("subscriptions")
    .select("stripe_customer_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (data?.stripe_customer_id) {
    throw new Error(
      `Refusing to seed user ${userId}: has a Stripe customer id (${data.stripe_customer_id}). ` +
        `This looks like a real paying account, not a dedicated pitch demo account. No writes were made.`,
    );
  }
}

const CAMERA_BODY = "Sony A7 IV";
const CAMERA_LENSES = ["FE 85mm f/1.4 GM", "FE 24-70mm f/2.8 GM II"];

const MONTHLY_REQUEST_COUNT = 143; // well under Portrait's 500 — no soft-warning banner

const SEEDED_SESSION_TITLE = "Golden hour backlit portrait";
const SEEDED_USER_TEXT =
  "Backlit portrait at golden hour, 85mm, subject facing away from the sun, shooting handheld.";

const SEEDED_ASSISTANT_CONTENT: SettingsResponseOk = {
  status: "ok",
  iso: 100,
  aperture: "f/1.4",
  shutter_speed: "1/500",
  white_balance: "daylight",
  color_temperature: "5500K",
  scene_summary:
    "The sun is low and behind your subject, so exposure is metered for skin tones rather than the sky. Shooting wide open at f/1.4 puts the GM glass to work for maximum subject separation, ISO 100 keeps files clean, and 1/500 comfortably freezes handheld shake and minor subject movement.",
  assumptions: [
    "85mm lens assumed from your camera profile",
    "Sun roughly 20–30 minutes above the horizon",
    "Daylight white balance set deliberately to preserve the golden-hour warmth — not the camera's Auto default",
  ],
  warnings: [
    "Backlighting can fool metering — check your histogram for blown highlights around the hair line",
  ],
  credits_used: true,
  monthly_count: MONTHLY_REQUEST_COUNT,
  credits_remaining: 0,
  session_id: "", // overwritten with the real session_id once the row exists
};

async function seedCameraProfile(userId: string): Promise<void> {
  const { error } = await admin.from("camera_profiles").upsert(
    {
      user_id: userId,
      body: CAMERA_BODY,
      lenses: CAMERA_LENSES,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error) throw error;
}

// handle_new_user always inserts exactly one subscriptions row on user
// creation (tier='snapshot') — update it rather than upsert, since there's
// no unique constraint to upsert against.
async function seedSubscription(userId: string): Promise<void> {
  const { error } = await admin
    .from("subscriptions")
    .update({ tier: "portrait", status: "active", end_date: null })
    .eq("user_id", userId);
  if (error) throw error;
}

async function seedUsage(userId: string): Promise<void> {
  const now = new Date();
  const { error } = await admin.from("usage_tracking").upsert(
    {
      user_id: userId,
      month: now.getUTCMonth() + 1,
      year: now.getUTCFullYear(),
      request_count: MONTHLY_REQUEST_COUNT,
      updated_at: now.toISOString(),
    },
    { onConflict: "user_id,month,year" },
  );
  if (error) throw error;
}

async function seedCredits(userId: string): Promise<void> {
  const { error } = await admin.from("credit_balances").upsert(
    {
      user_id: userId,
      credits_remaining: 0,
      total_purchased: 0,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error) throw error;
}

// Find-or-create a fixed demo session by title. On an existing session,
// "touch" updated_at to now — a light mitigation for Sidebar's relative-time
// display ("3m ago"), which otherwise drifts run to run. (The pipeline's
// primary defense against that drift, if the sidebar ends up in frame for
// any shot, should be freezing Date.now() in the page itself — see the
// pitch-pipeline report.)
//
// Messages are re-asserted by presence, not tied to session creation: if the
// session row exists but its messages were deleted out-of-band, this
// recreates them instead of leaving that state stuck behind a manual delete.
async function seedSession(userId: string): Promise<string> {
  const { data: existing, error: findError } = await admin
    .from("sessions")
    .select("session_id")
    .eq("user_id", userId)
    .eq("title", SEEDED_SESSION_TITLE)
    .maybeSingle();
  if (findError) throw findError;

  let sessionId: string;
  if (existing) {
    sessionId = existing.session_id;
    const { error } = await admin
      .from("sessions")
      .update({ updated_at: new Date().toISOString() })
      .eq("session_id", sessionId);
    if (error) throw error;
  } else {
    const { data: inserted, error: insertError } = await admin
      .from("sessions")
      .insert({ user_id: userId, title: SEEDED_SESSION_TITLE })
      .select("session_id")
      .single();
    if (insertError) throw insertError;
    sessionId = inserted.session_id as string;
  }

  const { count, error: countError } = await admin
    .from("session_messages")
    .select("message_id", { count: "exact", head: true })
    .eq("session_id", sessionId);
  if (countError) throw countError;

  if (!count) {
    const { error: messagesError } = await admin.from("session_messages").insert([
      { session_id: sessionId, role: "user", content: { text: SEEDED_USER_TEXT } },
      {
        session_id: sessionId,
        role: "assistant",
        content: { ...SEEDED_ASSISTANT_CONTENT, session_id: sessionId },
      },
    ]);
    if (messagesError) throw messagesError;
  }

  return sessionId;
}

async function main(): Promise<void> {
  assertSeedableEmail(email);
  const userId = await findOrCreateUser();
  await assertNoForeignSessions(userId);
  await assertNoStripeCustomer(userId);
  await seedCameraProfile(userId);
  await seedSubscription(userId);
  await seedUsage(userId);
  await seedCredits(userId);
  const sessionId = await seedSession(userId);

  console.log("Pitch seed complete:", { userId, sessionId, email });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
