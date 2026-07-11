// Per arch-spec-v3.1.md §7 GET /api/sessions/:id contract.
// Auth pattern mirrors src/app/api/sessions/route.ts.
//
// Ownership-only (ambient auth.uid() = user_id via RLS + an explicit
// .eq("user_id", ...) filter as belt-and-suspenders) — deliberately NOT
// tier-gated. The Snapshot 3-session cap enforced in GET /api/sessions is a
// display limit on the list endpoint, not an access-revocation policy on
// the user's own data.
import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
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
    const { data: session, error: sessionError } = await supabase
      .from("sessions")
      .select("session_id, title")
      .eq("session_id", id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (sessionError) throw sessionError;

    // Identical response whether the id doesn't exist or belongs to someone
    // else — never leak which.
    if (!session) {
      return NextResponse.json(
        { error: "not_found", message: "Session not found." },
        { status: 404 }
      );
    }

    const { data: messages, error: messagesError } = await supabase
      .from("session_messages")
      .select("message_id, role, content, created_at")
      .eq("session_id", id)
      .order("created_at", { ascending: true });

    if (messagesError) throw messagesError;

    return NextResponse.json({
      session_id: session.session_id,
      title: session.title,
      messages: messages ?? [],
    });
  } catch (err) {
    console.error("GET /api/sessions/[id] failure:", err);
    return NextResponse.json(
      { error: "server_error", message: "Couldn't load that session — try again?" },
      { status: 500 }
    );
  }
}
