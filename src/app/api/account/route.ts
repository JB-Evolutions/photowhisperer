// Per arch-spec-v3.1.md §3, implementation-guide.md PACK 6.
// Auth pattern mirrors src/app/api/credits/route.ts.
import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { TIER_LIMITS } from "@/lib/quota";
import type { Tier } from "@/lib/quota";

export async function GET() {
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

  try {
    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();

    const [{ data: sub }, { data: credits }, { data: usage }] = await Promise.all([
      supabase
        .from("subscriptions")
        .select("tier")
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("credit_balances")
        .select("credits_remaining, total_purchased")
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("usage_tracking")
        .select("request_count")
        .eq("user_id", user.id)
        .eq("month", month)
        .eq("year", year)
        .maybeSingle(),
    ]);

    const tier = (sub?.tier ?? "snapshot") as Tier;

    return NextResponse.json({
      tier,
      monthly_used: usage?.request_count ?? 0,
      monthly_limit: TIER_LIMITS[tier] ?? TIER_LIMITS.snapshot,
      credits_remaining: credits?.credits_remaining ?? 0,
      total_purchased: credits?.total_purchased ?? 0,
    });
  } catch (err) {
    console.error("GET /api/account failure:", err);
    return NextResponse.json(
      { error: "server_error", message: "Couldn't load your account data — try again?" },
      { status: 500 }
    );
  }
}
