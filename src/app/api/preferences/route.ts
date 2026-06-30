import { NextResponse, type NextRequest } from "next/server";
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
    const { data } = await supabase
      .from("user_preferences")
      .select("default_focal_length_mm, product_emails_opt_in")
      .eq("user_id", user.id)
      .maybeSingle();

    // No row means the user hasn't saved prefs yet — return defaults, don't error.
    return NextResponse.json({
      default_focal_length_mm: data?.default_focal_length_mm ?? null,
      product_emails_opt_in: data?.product_emails_opt_in ?? false,
    });
  } catch (err) {
    console.error("GET /api/preferences failure:", err);
    return NextResponse.json(
      { error: "server_error", message: "Couldn't load your preferences — try again?" },
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

  const { default_focal_length_mm: rawFocal, product_emails_opt_in: rawEmails } =
    rawBody as Record<string, unknown>;

  // Both fields required every call (full-replace semantics).
  // null is valid for focal (explicit clear); undefined means the key was omitted → reject.
  if (rawFocal === undefined) {
    return NextResponse.json(
      {
        error: "validation",
        message: "default_focal_length_mm is required (use null to clear).",
      },
      { status: 400 }
    );
  }

  if (rawFocal !== null) {
    if (
      typeof rawFocal !== "number" ||
      !Number.isInteger(rawFocal) ||
      rawFocal < 8 ||
      rawFocal > 1200
    ) {
      return NextResponse.json(
        {
          error: "validation",
          message: "Default focal length must be a whole number between 8 and 1200, or null.",
        },
        { status: 400 }
      );
    }
  }

  if (typeof rawEmails !== "boolean") {
    return NextResponse.json(
      { error: "validation", message: "product_emails_opt_in must be a boolean." },
      { status: 400 }
    );
  }

  const default_focal_length_mm = rawFocal as number | null;
  const product_emails_opt_in = rawEmails;

  try {
    // Upsert: first save inserts (trigger doesn't seed this table); subsequent
    // saves update on the user_id PK conflict. INSERT + UPDATE RLS policies both apply.
    const { error } = await supabase
      .from("user_preferences")
      .upsert(
        { user_id: user.id, default_focal_length_mm, product_emails_opt_in },
        { onConflict: "user_id" }
      );

    if (error) {
      console.error("PUT /api/preferences failure:", error);
      return NextResponse.json(
        { error: "server_error", message: "Couldn't save your preferences — try again?" },
        { status: 500 }
      );
    }

    return NextResponse.json({ default_focal_length_mm, product_emails_opt_in });
  } catch (err) {
    console.error("PUT /api/preferences failure:", err);
    return NextResponse.json(
      { error: "server_error", message: "Couldn't save your preferences — try again?" },
      { status: 500 }
    );
  }
}
