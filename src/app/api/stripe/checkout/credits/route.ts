// Per implementation-guide.md Pack 5 Step 4.
import { NextResponse, type NextRequest } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe";
import { CREDIT_PACKS, type CreditPackCode } from "@/lib/quota";

export const dynamic = "force-dynamic";

const PACK_STRIPE_ENV: Record<CreditPackCode, string | undefined> = {
  s: process.env.STRIPE_PRICE_ID_CREDITS_50,
  m: process.env.STRIPE_PRICE_ID_CREDITS_200,
  l: process.env.STRIPE_PRICE_ID_CREDITS_500,
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

  const pack = (body as { pack?: unknown })?.pack;
  if (pack !== "s" && pack !== "m" && pack !== "l") {
    return NextResponse.json(
      { error: "validation", message: "pack must be 's', 'm', or 'l'." },
      { status: 400 }
    );
  }

  const priceId = PACK_STRIPE_ENV[pack];
  if (!priceId) {
    console.error(`Missing Stripe price ID env var for credit pack '${pack}'.`);
    return NextResponse.json(
      { error: "configuration", message: `No price configured for pack '${pack}'.` },
      { status: 500 }
    );
  }

  const amount = CREDIT_PACKS[pack].credits;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL;

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${appUrl}/billing/success?type=credits&pack=${pack}`,
    cancel_url: `${appUrl}/billing/cancel`,
    customer_email: user.email,
    metadata: {
      user_id: user.id,
      // credit_amount is derived server-side from CREDIT_PACKS. Never accept a credit
      // amount from the request body — the webhook grants whatever it finds here.
      credit_amount: String(amount),
    },
  });

  return NextResponse.json({ url: session.url });
}
