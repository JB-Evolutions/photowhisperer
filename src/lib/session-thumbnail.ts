// Server-only. Best-effort persistence of the 256px thumbnail a photo request
// carries. Never the full-resolution image: that would triple storage cost,
// a photo of a person is personal data under GDPR, and it is a
// content-moderation liability.
//
// Runs after the response is sent. Nothing here may throw into the request.
import { createAdminClient } from "./supabase/admin";

// Off switch for thumbnail storage. Validation of the thumbnail in
// /api/settings runs regardless.
export const THUMBNAIL_PERSISTENCE_ENABLED = true;

// Private bucket. Must exist before uploads can succeed.
export const THUMBNAIL_BUCKET = "session-thumbnails";

export type PersistThumbnailArgs = {
  userId: string;
  sessionId: string;
  // content.text of the user message the thumbnail belongs to.
  text: string;
  thumbnailBase64: string;
};

// Uploads to {user_id}/{session_id}/{uuid}.jpg and records the storage path
// (not a signed URL) as content.thumbnailPath on the user message. Returns the
// path, or null when anything failed; thumbnailPath then stays null.
export async function persistSessionThumbnail(args: PersistThumbnailArgs): Promise<string | null> {
  const { userId, sessionId, text, thumbnailBase64 } = args;
  try {
    const admin = createAdminClient();
    const path = `${userId}/${sessionId}/${crypto.randomUUID()}.jpg`;

    const { error: uploadError } = await admin.storage
      .from(THUMBNAIL_BUCKET)
      .upload(path, Buffer.from(thumbnailBase64, "base64"), {
        contentType: "image/jpeg",
        upsert: false,
      });
    if (uploadError) {
      console.warn(
        `session-thumbnail: upload to storage bucket "${THUMBNAIL_BUCKET}" failed (bucket missing or not writable?) for session ${sessionId}: ${uploadError.message}`
      );
      return null;
    }

    // appendMessages doesn't return ids, so the row is found as this
    // session's newest user message, confirmed by its text and empty slot.
    const { data: row, error: selectError } = await admin
      .from("session_messages")
      .select("message_id, content")
      .eq("session_id", sessionId)
      .eq("role", "user")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const content = row?.content as Record<string, unknown> | undefined;
    if (selectError || !row || content?.text !== text || content?.thumbnailPath !== null) {
      await admin.storage.from(THUMBNAIL_BUCKET).remove([path]);
      console.warn(
        `session-thumbnail: no matching user message to attach the thumbnail to for session ${sessionId}; upload removed from "${THUMBNAIL_BUCKET}"`
      );
      return null;
    }

    const { error: updateError } = await admin
      .from("session_messages")
      .update({ content: { ...content, thumbnailPath: path } })
      .eq("message_id", row.message_id);
    if (updateError) {
      await admin.storage.from(THUMBNAIL_BUCKET).remove([path]);
      console.warn(
        `session-thumbnail: recording thumbnailPath failed for session ${sessionId}; upload removed from "${THUMBNAIL_BUCKET}": ${updateError.message}`
      );
      return null;
    }

    return path;
  } catch (err) {
    console.warn(
      `session-thumbnail: persisting to storage bucket "${THUMBNAIL_BUCKET}" failed for session ${sessionId}:`,
      err
    );
    return null;
  }
}
