// Per arch-spec-v3.1.md §2.4, implementation-guide.md PACK 6.
// Auth pattern mirrors src/app/api/sessions/route.ts.
import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";

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
    const { data, error } = await supabase
      .from("credit_balances")
      .select("credits_remaining, total_purchased")
      .eq("user_id", user.id)
      .maybeSingle();

    // maybeSingle() returns null (not an error) on zero rows,
    // so this only fires on genuine DB failures.
    if (error) throw error;

    return NextResponse.json({
      credits_remaining: data?.credits_remaining ?? 0,
      total_purchased: data?.total_purchased ?? 0,
    });
  } catch (err) {
    console.error("GET /api/credits failure:", err);
    return NextResponse.json(
      { error: "server_error", message: "Couldn't load your credit balance — try again?" },
      { status: 500 }
    );
  }
}
