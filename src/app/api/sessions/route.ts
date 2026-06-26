// Per arch-spec-v3.1.md §3, implementation-guide.md PACK 6.
// Auth pattern mirrors src/app/api/camera-profile/route.ts.
import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { getHistoryLimit } from "@/lib/quota";

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
    const { data: sub } = await supabase
      .from("subscriptions")
      .select("tier")
      .eq("user_id", user.id)
      .maybeSingle();

    const limit = getHistoryLimit(sub?.tier ?? "snapshot");

    let query = supabase
      .from("sessions")
      .select("session_id, title, updated_at")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false });

    if (limit !== -1) {
      query = query.limit(limit);
    }

    const { data: sessions, error: sessionsError } = await query;

    if (sessionsError) throw sessionsError;

    return NextResponse.json({ sessions: sessions ?? [] });
  } catch (err) {
    console.error("GET /api/sessions failure:", err);
    return NextResponse.json(
      { error: "server_error", message: "Couldn't load your sessions — try again?" },
      { status: 500 }
    );
  }
}
