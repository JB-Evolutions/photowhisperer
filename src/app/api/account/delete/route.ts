import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe";

export async function POST() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: "unauthorized", message: "You must be signed in." },
      { status: 401 }
    );
  }

  // Step 1: Soft-delete. If this fails, abort — don't proceed to Stripe or signOut.
  const { error: updateError } = await supabase
    .from("users")
    .update({ deleted_at: new Date().toISOString() })
    .eq("user_id", user.id);

  if (updateError) {
    console.error("POST /api/account/delete — failed to set deleted_at:", updateError);
    return NextResponse.json(
      { error: "server_error", message: "Couldn't delete your account — try again." },
      { status: 500 }
    );
  }

  // Step 2: Cancel Stripe subscription if present. Free-tier users have no
  // stripe_subscription_id — skip silently. If cancel throws, log for manual
  // cleanup but do NOT block: deleted_at is already committed.
  const { data: sub } = await supabase
    .from("subscriptions")
    .select("stripe_subscription_id")
    .eq("user_id", user.id)
    .maybeSingle();

  const stripeSubId =
    (sub as { stripe_subscription_id: string | null } | null)
      ?.stripe_subscription_id ?? null;

  if (stripeSubId) {
    try {
      await getStripe().subscriptions.cancel(stripeSubId);
    } catch (err) {
      console.error(
        `POST /api/account/delete — Stripe cancel failed (user ${user.id}, sub ${stripeSubId}):`,
        err
      );
    }
  }

  // Step 3: Revoke session. deleted_at is already committed; proxy gates this
  // user on their next request regardless of session state after this point.
  await supabase.auth.signOut();

  return NextResponse.json({ ok: true });
}
