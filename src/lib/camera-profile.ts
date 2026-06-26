// Per arch-spec-v3.1.md §2.5. Mirrors the subscription-tier lookup pattern in
// src/app/api/settings/route.ts: cookie-scoped client, RLS permits the row.
import { createClient as createServerClient } from "./supabase/server";
import type { CameraProfile } from "../api/types";

export type { CameraProfile };

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

// Only columns present in `updates` are sent to upsert, so unset fields keep
// their existing value on UPDATE (verified: a lenses-only upsert does not
// null out body/flash/notes on an existing row).
export async function upsertCameraProfile(
  user_id: string,
  updates: Partial<CameraProfile>
): Promise<CameraProfile> {
  const supabase = await createServerClient();

  const fields: Partial<CameraProfile> = {};
  if (updates.body !== undefined) fields.body = updates.body;
  if (updates.lenses !== undefined) fields.lenses = updates.lenses;
  if (updates.flash !== undefined) fields.flash = updates.flash;
  if (updates.notes !== undefined) fields.notes = updates.notes;

  const { data, error } = await supabase
    .from("camera_profiles")
    .upsert(
      { user_id, ...fields, updated_at: new Date().toISOString() },
      { onConflict: "user_id" }
    )
    .select("body, lenses, flash, notes")
    .single();

  if (error) throw error;

  return {
    body: data.body,
    lenses: data.lenses,
    flash: data.flash,
    notes: data.notes,
  };
}
