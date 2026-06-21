// Per implementation-guide.md Pack 5 Step 3.
import { NextResponse, type NextRequest } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe";

export const dynamic = "force-dynamic";

const TIER_PRICE_IDS: Record<"portrait" | "studio", string | undefined> = {
  portrait: process.env.STRIPE_PRICE_ID_PORTRAIT,
  studio: process.env.STRIPE_PRICE_ID_STUDIO,
};

export async function POST(request: NextRequest) {
  const stripe = getStripe();
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "validation", message: "Request body must be valid JSON." },
      { status: 400 }
    );
  }

  const tier = (body as { tier?: unknown })?.tier;
  if (tier !== "portrait" && tier !== "studio") {
    return NextResponse.json(
      { error: "validation", message: "tier must be 'portrait' or 'studio'." },
      { status: 400 }
    );
  }

  const priceId = TIER_PRICE_IDS[tier];
  if (!priceId) {
    return NextResponse.json(
      { error: "configuration", message: `No price configured for tier '${tier}'.` },
      { status: 500 }
    );
  }

  // Reuse the existing Stripe customer if this user already has one — a
  // returning subscriber (subscribe -> cancel -> resubscribe) must not get a
  // second Stripe customer, since subscriptions.stripe_customer_id is UNIQUE.
  const { data: existingSub } = await supabase
    .from("subscriptions")
    .select("stripe_customer_id")
    .eq("user_id", user.id)
    .maybeSingle();
  const existingCustomerId = existingSub?.stripe_customer_id ?? null;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL;

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${appUrl}/billing/success`,
    cancel_url: `${appUrl}/billing/cancel`,
    client_reference_id: user.id,
    ...(existingCustomerId
      ? { customer: existingCustomerId }
      : { customer_email: user.email }),
    metadata: {
      user_id: user.id,
      app_tier: tier,
    },
  });

  return NextResponse.json({ url: session.url });
}
