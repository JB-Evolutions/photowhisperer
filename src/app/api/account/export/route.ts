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
    const [
      { data: profile,  error: profileErr  },
      { data: sub,      error: subErr      },
      { data: credits,  error: creditsErr  },
      { data: usage,    error: usageErr    },
      { data: camera,   error: cameraErr   },
      { data: prefs,    error: prefsErr    },
      { data: sessions, error: sessionsErr },
    ] = await Promise.all([
      supabase
        .from("users")
        .select("email, display_name, created_at, updated_at")
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("subscriptions")
        .select("tier, status, start_date, end_date, stripe_customer_id, stripe_subscription_id, created_at, updated_at")
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("credit_balances")
        .select("credits_remaining, total_purchased, last_purchased_at, updated_at")
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("usage_tracking")
        .select("month, year, request_count, created_at, updated_at")
        .eq("user_id", user.id)
        .order("year",  { ascending: true })
        .order("month", { ascending: true }),
      supabase
        .from("camera_profiles")
        .select("body, lenses, flash, notes, updated_at")
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("user_preferences")
        .select("default_focal_length_mm, product_emails_opt_in")
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("sessions")
        .select("session_id, title, created_at, updated_at, session_messages(role, content, created_at)")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true })
        .order("created_at", { referencedTable: "session_messages", ascending: true }),
    ]);

    if (profileErr || subErr || creditsErr || usageErr || cameraErr || prefsErr || sessionsErr) {
      const err = profileErr ?? subErr ?? creditsErr ?? usageErr ?? cameraErr ?? prefsErr ?? sessionsErr;
      console.error("GET /api/account/export query failure:", err);
      return NextResponse.json(
        { error: "server_error", message: "Couldn't prepare your export — try again." },
        { status: 500 }
      );
    }

    const dateStr = new Date().toISOString().slice(0, 10);

    const shapedSessions = (sessions ?? []).map((s) => {
      const { session_messages, ...rest } = s as {
        session_messages: unknown[] | null;
        [key: string]: unknown;
      };
      return { ...rest, messages: session_messages ?? [] };
    });

    const exportData = {
      exported_at: new Date().toISOString(),
      account: profile ?? null,
      subscription: sub
        ? {
            ...sub,
            billing_note:
              "Invoices and payment history are managed in the Stripe billing portal, accessible from your account.",
          }
        : null,
      credits: credits ?? null,
      usage: usage ?? [],
      camera_profile: camera ?? null,
      preferences: prefs ?? null,
      sessions: shapedSessions,
    };

    return new NextResponse(JSON.stringify(exportData, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="photowhisperer-data-${dateStr}.json"`,
      },
    });
  } catch (err) {
    console.error("GET /api/account/export failure:", err);
    return NextResponse.json(
      { error: "server_error", message: "Couldn't prepare your export — try again." },
      { status: 500 }
    );
  }
}
