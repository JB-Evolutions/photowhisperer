import { redirect } from "next/navigation";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { TIER_LIMITS } from "@/lib/quota";
import type { Tier } from "@/lib/quota";
import BillingView from "./BillingView";
import { NOINDEX } from "@/lib/seo";

export const metadata = { title: "Billing · PhotoWhisperer", robots: NOINDEX };

export default async function BillingPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/signin");

  const now = new Date();
  const month = now.getUTCMonth() + 1;
  const year = now.getUTCFullYear();

  const [subResult, creditsResult, usageResult] = await Promise.all([
    supabase
      .from("subscriptions")
      .select("tier, end_date, stripe_customer_id")
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

  const subData = subResult.data as {
    tier: string;
    end_date: string | null;
    stripe_customer_id: string | null;
  } | null;

  const creditsData = creditsResult.data as {
    credits_remaining: number;
    total_purchased: number;
  } | null;

  const usageData = usageResult.data as { request_count: number } | null;

  const tier = (subData?.tier ?? "snapshot") as Tier;

  return (
    <BillingView
      tier={tier}
      monthly_used={usageData?.request_count ?? 0}
      monthly_limit={TIER_LIMITS[tier] ?? TIER_LIMITS.snapshot}
      credits_remaining={creditsData?.credits_remaining ?? 0}
      total_purchased={creditsData?.total_purchased ?? 0}
      subscription_end_date={subData?.end_date ?? null}
    />
  );
}
