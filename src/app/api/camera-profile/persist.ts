// Storage for the structured camera profile. Split out of ./structured so that
// file stays free of server-only imports — the onboarding client component
// imports MAX_LENSES from it, and a runtime edge to the Supabase server client
// drags next/headers into the browser bundle.
//
// The rows themselves belong to getGearProfile/upsertGearProfile, which are the
// single reader and writer of camera_lenses; this module only maps between the
// route's payload shape and theirs.
//
// Not atomic: upsertGearProfile issues the profile upsert, lens delete and lens
// insert as three statements. A failure part-way leaves the previous lenses
// deleted; the onboarding UI keeps the unsaved list in state and offers a
// retry, and a retried save rewrites the whole set.
import { getGearProfile, upsertGearProfile } from "@/lib/camera-profile";
import type { StructuredProfileInput, StructuredProfileRead } from "./structured";

export async function saveStructuredProfile(
  userId: string,
  input: StructuredProfileInput,
): Promise<void> {
  // The lenses are already parsed — validateLens built them from the payload's
  // own fields — so they go straight through. body is nullable here and
  // BodyProfile.label is not; upsertGearProfile stores a blank label as NULL.
  await upsertGearProfile(userId, {
    body: {
      label: input.body ?? "",
      cropFactor: input.cropFactor,
      ibisStops: input.ibisStops,
      isoBase: input.isoBase,
      isoMode: input.isoMode,
      isoValue: input.isoValue,
      isoMax: input.isoMax,
    },
    lenses: input.lenses,
  });
}

export async function loadStructuredProfile(
  userId: string,
): Promise<StructuredProfileRead | null> {
  const gear = await getGearProfile(userId);
  if (!gear) return null;
  // The free-text body label is served by the legacy half of the GET response,
  // so it is dropped here rather than duplicated.
  const { cropFactor, ibisStops, isoBase, isoMode, isoValue, isoMax } = gear.body;
  return { cropFactor, ibisStops, isoBase, isoMode, isoValue, isoMax, lenses: gear.lenses };
}
