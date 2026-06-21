// Per implementation-guide.md Pack 5 Step 5.
import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { stripe } from "@/lib/stripe";

export async function GET() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("stripe_customer_id")
    .eq("user_id", user.id)
    .maybeSingle();

  const customerId = subscription?.stripe_customer_id;
  if (!customerId) {
    return NextResponse.json(
      { error: "no_customer", message: "No billing account found for this user." },
      { status: 400 }
    );
  }

  const portalSession = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${process.env.NEXT_PUBLIC_APP_URL}/account/billing`,
  });

  return NextResponse.json({ url: portalSession.url });
}
