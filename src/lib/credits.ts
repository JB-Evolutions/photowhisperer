// Per arch-spec-v3.1.md §6 (GET /api/credits). Mirrors the cookie-scoped
// client pattern in src/lib/camera-profile.ts: RLS permits the row.
import { createClient as createServerClient } from "./supabase/server";

export interface CreditBalance {
  credits_remaining: number;
  total_purchased: number;
}

// WARNING: cookie-scoped (RLS) client — for authed user reads only.
// Do NOT use in the Stripe webhook; that path needs the service-role client
// and does its own atomic credit write inline (Pack 5 Step 6f).
export async function getCreditBalance(user_id: string): Promise<CreditBalance> {
  const supabase = await createServerClient();

  const { data } = await supabase
    .from("credit_balances")
    .select("credits_remaining, total_purchased")
    .eq("user_id", user_id)
    .maybeSingle();

  return {
    credits_remaining: data?.credits_remaining ?? 0,
    total_purchased: data?.total_purchased ?? 0,
  };
}
