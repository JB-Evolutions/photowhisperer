// Per implementation-guide.md Pack 5 Step 6.
import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

function toId(value: string | { id: string } | null | undefined): string | null {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get("stripe-signature");

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      signature!,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    console.error("Stripe webhook signature verification failed:", err);
    return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: claimed, error: claimError } = await admin.rpc("claim_stripe_event", {
    p_event_id: event.id,
  });

  if (claimError) {
    console.error(`Stripe webhook claim failed for event ${event.id}:`, claimError);
    return NextResponse.json({ error: "claim_failed" }, { status: 500 });
  }

  if (!claimed) {
    // Already processed — no-op.
    return NextResponse.json({ received: true });
  }

  try {
    await handleEvent(admin, event);
    return NextResponse.json({ received: true });
  } catch (err) {
    console.error(`Stripe webhook processing failed for event ${event.id}:`, err);
    await admin.from("stripe_events_processed").delete().eq("event_id", event.id);
    return NextResponse.json({ error: "processing_failed" }, { status: 500 });
  }
}

async function handleEvent(admin: AdminClient, event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case "checkout.session.completed":
      await handleCheckoutSessionCompleted(
        admin,
        event.data.object as Stripe.Checkout.Session
      );
      return;
    case "customer.subscription.created":
    case "customer.subscription.updated":
      await handleSubscriptionUpdated(admin, event.data.object as Stripe.Subscription);
      return;
    case "invoice.payment_succeeded":
      await handleInvoicePaymentSucceeded(admin, event.data.object as Stripe.Invoice);
      return;
    case "invoice.payment_failed":
      await handleInvoicePaymentFailed(admin, event.data.object as Stripe.Invoice);
      return;
    case "customer.subscription.deleted":
      await handleSubscriptionDeleted(admin, event.data.object as Stripe.Subscription);
      return;
    default:
      // Any other event type: no-op.
      return;
  }
}

async function handleCheckoutSessionCompleted(
  admin: AdminClient,
  session: Stripe.Checkout.Session
): Promise<void> {
  if (session.mode === "subscription") {
    const userId = session.client_reference_id ?? session.metadata?.user_id;
    const appTier = session.metadata?.app_tier;
    if (!userId || !appTier) {
      throw new Error(
        `checkout.session.completed (subscription) missing user_id/app_tier metadata for session ${session.id}`
      );
    }

    const { error } = await admin
      .from("subscriptions")
      .update({
        stripe_customer_id: toId(session.customer),
        stripe_subscription_id: toId(session.subscription),
        tier: appTier,
        status: "active",
        start_date: new Date().toISOString(),
      })
      .eq("user_id", userId);
    if (error) throw error;
    return;
  }

  if (session.mode === "payment") {
    if (session.payment_status !== "paid") return;

    const userId = session.metadata?.user_id;
    const creditAmountRaw = session.metadata?.credit_amount;
    if (!userId || !creditAmountRaw) {
      throw new Error(
        `checkout.session.completed (payment) missing user_id/credit_amount metadata for session ${session.id}`
      );
    }

    const { error } = await admin.rpc("grant_credits", {
      p_user_id: userId,
      p_amount: parseInt(creditAmountRaw, 10),
    });
    if (error) throw error;
  }
}

// Backup/gap-fill only — checkout.session.completed is the source of truth
// for tier. A row is only findable here by stripe_customer_id once checkout
// has already stamped it, so tier is never touched in this handler: by the
// time this query can match a row, that row's tier was already set in the
// same UPDATE that stamped stripe_customer_id.
async function handleSubscriptionUpdated(
  admin: AdminClient,
  subscription: Stripe.Subscription
): Promise<void> {
  const customerId = toId(subscription.customer);
  if (!customerId) return;

  const { error } = await admin
    .from("subscriptions")
    .update({
      status: mapSubscriptionStatus(subscription.status),
      end_date: subscription.ended_at
        ? new Date(subscription.ended_at * 1000).toISOString()
        : null,
    })
    .eq("stripe_customer_id", customerId);
  if (error) throw error;
}

async function handleInvoicePaymentSucceeded(
  admin: AdminClient,
  invoice: Stripe.Invoice
): Promise<void> {
  const customerId = toId(invoice.customer);
  if (!customerId) return;

  const periodEnd = invoice.lines.data[0]?.period.end;

  const { error } = await admin
    .from("subscriptions")
    .update({
      status: "active",
      ...(periodEnd ? { end_date: new Date(periodEnd * 1000).toISOString() } : {}),
    })
    .eq("stripe_customer_id", customerId);
  if (error) throw error;
}

async function handleInvoicePaymentFailed(
  admin: AdminClient,
  invoice: Stripe.Invoice
): Promise<void> {
  const customerId = toId(invoice.customer);
  if (!customerId) return;

  const { error } = await admin
    .from("subscriptions")
    .update({ status: "past_due" })
    .eq("stripe_customer_id", customerId);
  if (error) throw error;
}

async function handleSubscriptionDeleted(
  admin: AdminClient,
  subscription: Stripe.Subscription
): Promise<void> {
  const customerId = toId(subscription.customer);
  if (!customerId) return;

  const { error } = await admin
    .from("subscriptions")
    .update({
      status: "cancelled",
      end_date: subscription.ended_at
        ? new Date(subscription.ended_at * 1000).toISOString()
        : new Date().toISOString(),
    })
    .eq("stripe_customer_id", customerId);
  if (error) throw error;
}

function mapSubscriptionStatus(status: Stripe.Subscription.Status): string {
  switch (status) {
    case "active":
    case "trialing":
      return "active";
    case "canceled":
      return "cancelled";
    case "past_due":
    case "incomplete":
    case "incomplete_expired":
    case "paused":
    case "unpaid":
      return "past_due";
  }
}
