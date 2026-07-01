import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { isWithinGracePeriod } from "@/lib/account-deletion";

export async function POST() {
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

  // Read current deleted_at to verify grace status before clearing.
  const { data: profile, error: readError } = await supabase
    .from("users")
    .select("deleted_at")
    .eq("user_id", user.id)
    .maybeSingle();

  if (readError) {
    console.error("POST /api/account/restore — failed to read deleted_at:", readError);
    return NextResponse.json(
      { error: "server_error", message: "Couldn't restore your account — try again." },
      { status: 500 }
    );
  }

  const deletedAt =
    (profile as { deleted_at: string | null } | null)?.deleted_at ?? null;

  // Already active — idempotent.
  if (!deletedAt) {
    return NextResponse.json({ ok: true });
  }

  // Past grace — permanently blocked, cannot restore.
  if (!isWithinGracePeriod(deletedAt)) {
    return NextResponse.json(
      {
        error: "grace_expired",
        message:
          "The recovery window has passed — your account can no longer be restored.",
      },
      { status: 403 }
    );
  }

  // Within grace: clear deleted_at.
  const { error: restoreError } = await supabase
    .from("users")
    .update({ deleted_at: null })
    .eq("user_id", user.id);

  if (restoreError) {
    console.error("POST /api/account/restore — failed to clear deleted_at:", restoreError);
    return NextResponse.json(
      { error: "server_error", message: "Couldn't restore your account — try again." },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
