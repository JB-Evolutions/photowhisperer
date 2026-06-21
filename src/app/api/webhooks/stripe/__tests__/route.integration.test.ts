// Pack 5 Step 6 integration tests. Hits the real linked Supabase project via
// the service-role client — uses a dedicated throwaway auth user, cleaned up
// in afterAll regardless of pass/fail. No dependency on ANTHROPIC_API_KEY.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { stripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { POST } from "../route";

const admin = createAdminClient();
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

let testUserId: string;

beforeAll(async () => {
  const email = `webhook-test+${Date.now()}@example.com`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: randomUUID(),
    email_confirm: true,
  });
  if (error || !data.user) {
    throw new Error(`Failed to create throwaway test user: ${error?.message}`);
  }
  testUserId = data.user.id;
  console.log(`Pack 5 webhook tests using throwaway test user: ${testUserId}`);
});

afterAll(async () => {
  if (!testUserId) return;
  // Cascades to public.users -> subscriptions, credit_balances, usage_tracking,
  // sessions, session_messages, camera_profiles (all ON DELETE CASCADE).
  await admin.auth.admin.deleteUser(testUserId);
});

function buildEventPayload(
  id: string,
  type: string,
  object: Record<string, unknown>
) {
  return JSON.stringify({
    id,
    object: "event",
    api_version: "2026-05-27.dahlia",
    created: Math.floor(Date.now() / 1000),
    type,
    data: { object },
  });
}

function signedRequest(rawBody: string, signatureOverride?: string): NextRequest {
  const signature =
    signatureOverride ??
    stripe.webhooks.generateTestHeaderString({
      payload: rawBody,
      secret: webhookSecret,
    });

  return new NextRequest("http://localhost:3000/api/webhooks/stripe", {
    method: "POST",
    body: rawBody,
    headers: { "stripe-signature": signature },
  });
}

async function getSubscriptionRow(userId: string) {
  const { data, error } = await admin
    .from("subscriptions")
    .select("tier, status, stripe_customer_id, stripe_subscription_id")
    .eq("user_id", userId)
    .single();
  if (error) throw error;
  return data;
}

async function getCreditsRemaining(userId: string): Promise<number> {
  const { data, error } = await admin
    .from("credit_balances")
    .select("credits_remaining")
    .eq("user_id", userId)
    .single();
  if (error) throw error;
  return data.credits_remaining;
}

async function getClaimRow(eventId: string) {
  const { data, error } = await admin
    .from("stripe_events_processed")
    .select("processed_at")
    .eq("event_id", eventId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

describe("POST /api/webhooks/stripe (Pack 5 integration, real Supabase project)", () => {
  it("signature failure -> 400, nothing written", async () => {
    const eventId = `evt_test_badsig_${randomUUID()}`;
    const rawBody = buildEventPayload(eventId, "checkout.session.completed", {
      id: "cs_test_irrelevant",
    });

    const response = await POST(signedRequest(rawBody, "t=1,v1=not-a-real-signature"));

    expect(response.status).toBe(400);
    const claim = await getClaimRow(eventId);
    expect(claim).toBeNull();
  });

  it("subscription.created BEFORE checkout (out-of-order) -> clean 200 no-op, then checkout sets tier correctly", async () => {
    const fakeCustomerId = `cus_test_${randomUUID()}`;
    const fakeSubscriptionId = `sub_test_${randomUUID()}`;

    // Out-of-order delivery: this customer id isn't linked to any row yet.
    const createdEventId = `evt_test_subcreated_${randomUUID()}`;
    const createdPayload = buildEventPayload(
      createdEventId,
      "customer.subscription.created",
      {
        id: fakeSubscriptionId,
        customer: fakeCustomerId,
        status: "active",
        ended_at: null,
      }
    );
    const outOfOrderResponse = await POST(signedRequest(createdPayload));
    expect(outOfOrderResponse.status).toBe(200);

    const beforeCheckout = await getSubscriptionRow(testUserId);
    expect(beforeCheckout.tier).toBe("snapshot");
    expect(beforeCheckout.stripe_customer_id).toBeNull();

    // checkout.session.completed (subscription) is the canonical tier write.
    const checkoutEventId = `evt_test_checkout_sub_${randomUUID()}`;
    const checkoutPayload = buildEventPayload(
      checkoutEventId,
      "checkout.session.completed",
      {
        id: "cs_test_subscription",
        mode: "subscription",
        client_reference_id: testUserId,
        customer: fakeCustomerId,
        subscription: fakeSubscriptionId,
        metadata: { user_id: testUserId, app_tier: "portrait" },
      }
    );
    const checkoutResponse = await POST(signedRequest(checkoutPayload));
    expect(checkoutResponse.status).toBe(200);

    const afterCheckout = await getSubscriptionRow(testUserId);
    expect(afterCheckout.tier).toBe("portrait");
    expect(afterCheckout.status).toBe("active");
    expect(afterCheckout.stripe_customer_id).toBe(fakeCustomerId);
    expect(afterCheckout.stripe_subscription_id).toBe(fakeSubscriptionId);

    // SAME subscription event delivered twice -> second delivery must be a
    // no-op (claim row's processed_at must not change, i.e. it never re-ran).
    const firstClaim = await getClaimRow(checkoutEventId);
    expect(firstClaim).not.toBeNull();

    const replayResponse = await POST(signedRequest(checkoutPayload));
    expect(replayResponse.status).toBe(200);

    const secondClaim = await getClaimRow(checkoutEventId);
    expect(secondClaim?.processed_at).toBe(firstClaim?.processed_at);
  });

  it("checkout.session.completed (payment, paid) -> credit_balances += amount; same event twice -> unchanged", async () => {
    const before = await getCreditsRemaining(testUserId);

    const eventId = `evt_test_credit_${randomUUID()}`;
    const payload = buildEventPayload(eventId, "checkout.session.completed", {
      id: "cs_test_credits",
      mode: "payment",
      payment_status: "paid",
      metadata: { user_id: testUserId, credit_amount: "50" },
    });

    const firstResponse = await POST(signedRequest(payload));
    expect(firstResponse.status).toBe(200);

    const afterFirst = await getCreditsRemaining(testUserId);
    expect(afterFirst).toBe(before + 50);

    // Critical idempotency test: redeliver the IDENTICAL event id.
    const secondResponse = await POST(signedRequest(payload));
    expect(secondResponse.status).toBe(200);

    const afterSecond = await getCreditsRemaining(testUserId);
    expect(afterSecond).toBe(afterFirst);
  });

  it("forced failure after claim -> claim row deleted -> retry of same event re-processes", async () => {
    // metadata.user_id is not a valid UUID, so the grant_credits RPC's
    // p_user_id UUID parameter fails Postgres-side type casting, throwing
    // AFTER the claim has already succeeded.
    const eventId = `evt_test_forcedfail_${randomUUID()}`;
    const payload = buildEventPayload(eventId, "checkout.session.completed", {
      id: "cs_test_forcedfail",
      mode: "payment",
      payment_status: "paid",
      metadata: { user_id: "not-a-valid-uuid", credit_amount: "50" },
    });

    const firstResponse = await POST(signedRequest(payload));
    expect(firstResponse.status).toBe(500);

    const claimAfterFailure = await getClaimRow(eventId);
    expect(claimAfterFailure).toBeNull();

    // Retry of the identical event: must be re-claimed (not skipped as
    // already-processed), proving the rollback actually deleted the row.
    const retryResponse = await POST(signedRequest(payload));
    expect(retryResponse.status).toBe(500);

    const claimAfterRetry = await getClaimRow(eventId);
    expect(claimAfterRetry).toBeNull();
  });
});
