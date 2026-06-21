// Per implementation-guide.md Pack 5 Step 4.
import { NextResponse, type NextRequest } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe";

export const dynamic = "force-dynamic";

const CREDIT_PACKS: Record<"s" | "m" | "l", { priceId: string | undefined; amount: number }> = {
  s: { priceId: process.env.STRIPE_PRICE_ID_CREDITS_50, amount: 50 },
  m: { priceId: process.env.STRIPE_PRICE_ID_CREDITS_200, amount: 200 },
  l: { priceId: process.env.STRIPE_PRICE_ID_CREDITS_500, amount: 500 },
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

  const { priceId, amount } = CREDIT_PACKS[pack];
  if (!priceId) {
    return NextResponse.json(
      { error: "configuration", message: `No price configured for pack '${pack}'.` },
      { status: 500 }
    );
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL;

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${appUrl}/billing/success`,
    cancel_url: `${appUrl}/billing/cancel`,
    customer_email: user.email,
    metadata: {
      user_id: user.id,
      credit_amount: String(amount),
    },
  });

  return NextResponse.json({ url: session.url });
}
