// Per arch-spec-v3.1.md §2.5. Mirrors the subscription-tier lookup pattern in
// src/app/api/settings/route.ts: cookie-scoped client, RLS permits the row.
import { createClient as createServerClient } from "./supabase/server";
import type { CameraProfile } from "../api/types";

export async function getCameraProfile(
  user_id: string
): Promise<CameraProfile | null> {
  const supabase = await createServerClient();

  const { data } = await supabase
    .from("camera_profiles")
    .select("body, lenses, flash, notes")
    .eq("user_id", user_id)
    .maybeSingle();

  if (!data) return null;

  return {
    body: data.body,
    lenses: data.lenses,
    flash: data.flash,
    notes: data.notes,
  };
}
