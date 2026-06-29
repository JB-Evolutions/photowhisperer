// Per arch-spec-v3.1.md §3, implementation-guide.md PACK 6.
// Auth pattern mirrors src/app/api/credits/route.ts.
import { NextResponse, type NextRequest } from "next/server";
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

    // maybeSingle() returns { data: null } (not an error) when no row matches —
    // display_name falls back to null safely for any pre-trigger legacy user.
    const [{ data: sub }, { data: credits }, { data: usage }, { data: profile }] =
      await Promise.all([
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
        supabase
          .from("users")
          .select("display_name")
          .eq("user_id", user.id)
          .maybeSingle(),
      ]);

    const tier = (sub?.tier ?? "snapshot") as Tier;

    return NextResponse.json({
      tier,
      monthly_used: usage?.request_count ?? 0,
      monthly_limit: TIER_LIMITS[tier] ?? TIER_LIMITS.snapshot,
      credits_remaining: credits?.credits_remaining ?? 0,
      total_purchased: credits?.total_purchased ?? 0,
      display_name: (profile?.display_name as string | null) ?? null,
    });
  } catch (err) {
    console.error("GET /api/account failure:", err);
    return NextResponse.json(
      { error: "server_error", message: "Couldn't load your account data — try again?" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
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

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json(
      { error: "validation", message: "Request body must be valid JSON." },
      { status: 400 }
    );
  }

  if (typeof rawBody !== "object" || rawBody === null) {
    return NextResponse.json(
      { error: "validation", message: "Request body must be a JSON object." },
      { status: 400 }
    );
  }

  const { display_name: rawDisplayName } = rawBody as Record<string, unknown>;

  if (
    rawDisplayName !== undefined &&
    rawDisplayName !== null &&
    typeof rawDisplayName !== "string"
  ) {
    return NextResponse.json(
      { error: "validation", message: "display_name must be a string or null." },
      { status: 400 }
    );
  }

  // Trim, then coerce empty/whitespace-only to null — matches DB CHECK constraint.
  const trimmed = typeof rawDisplayName === "string" ? rawDisplayName.trim() : null;
  const display_name: string | null = trimmed === "" ? null : trimmed;

  if (display_name !== null && display_name.length > 50) {
    return NextResponse.json(
      {
        error: "validation",
        message: "Display name must be 50 characters or fewer.",
      },
      { status: 400 }
    );
  }

  try {
    // handle_new_user guarantees every auth user has a users row, so zero-row
    // updates are not expected — but if one occurs the no-op is silent.
    const { error } = await supabase
      .from("users")
      .update({ display_name })
      .eq("user_id", user.id);

    if (error) {
      console.error("PUT /api/account failure:", error);
      return NextResponse.json(
        { error: "server_error", message: "Couldn't save your display name — try again?" },
        { status: 500 }
      );
    }

    return NextResponse.json({ display_name });
  } catch (err) {
    console.error("PUT /api/account failure:", err);
    return NextResponse.json(
      { error: "server_error", message: "Couldn't save your display name — try again?" },
      { status: 500 }
    );
  }
}
