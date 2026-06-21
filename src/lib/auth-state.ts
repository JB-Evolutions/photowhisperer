// Server-side auth/tier lookup for marketing pages (nav state, pricing CTAs, 404).
import { createClient } from "@/lib/supabase/server";
import type { Tier } from "@/lib/quota";

export interface MarketingAuthState {
  isLoggedIn: boolean;
  tier: Tier | null;
}

export async function getMarketingAuthState(): Promise<MarketingAuthState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { isLoggedIn: false, tier: null };
  }

  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("tier")
    .eq("user_id", user.id)
    .maybeSingle();

  return { isLoggedIn: true, tier: (subscription?.tier as Tier) ?? "snapshot" };
}
