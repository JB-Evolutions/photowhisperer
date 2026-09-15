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
  // session_messages.message_id of the user message, as returned by its insert.
  messageId: string;
  thumbnailBase64: string;
};

// Uploads to {user_id}/{session_id}/{uuid}.jpg and records the storage path
// (not a signed URL) as content.thumbnailPath on the user message. Returns the
// path, or null when anything failed; thumbnailPath then stays null.
export async function persistSessionThumbnail(args: PersistThumbnailArgs): Promise<string | null> {
  const { userId, sessionId, messageId, thumbnailBase64 } = args;
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

    // Read by id so the existing content is merged, not replaced.
    const { data: row, error: selectError } = await admin
      .from("session_messages")
      .select("content")
      .eq("message_id", messageId)
      .eq("session_id", sessionId)
      .eq("role", "user")
      .maybeSingle();
    if (selectError || !row) {
      await admin.storage.from(THUMBNAIL_BUCKET).remove([path]);
      console.warn(
        `session-thumbnail: user message ${messageId} not found for session ${sessionId}; upload removed from "${THUMBNAIL_BUCKET}"`
      );
      return null;
    }

    const content = row.content as Record<string, unknown>;
    const { error: updateError } = await admin
      .from("session_messages")
      .update({ content: { ...content, thumbnailPath: path } })
      .eq("message_id", messageId);
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

// Signed history URLs last an hour; the client re-fetches the session to get
// fresh ones.
export const THUMBNAIL_URL_TTL_S = 60 * 60;

type StoredMessage = { role: string; content: unknown };

// Swaps content.thumbnailPath on each user message for content.thumbnailUrl: a
// signed URL from the private bucket, or null when the message has no path or
// signing failed. The raw path never leaves the server. Best-effort like the
// upload: failures warn and yield null, and nothing here throws.
export async function signSessionThumbnails<T extends StoredMessage>(
  messages: T[],
  owner: { userId: string; sessionId: string }
): Promise<T[]> {
  const { userId, sessionId } = owner;
  const prefix = `${userId}/${sessionId}/`;

  const pathOf = (m: StoredMessage): string | null => {
    if (m.role !== "user" || !m.content || typeof m.content !== "object") return null;
    const path = (m.content as { thumbnailPath?: unknown }).thumbnailPath;
    return typeof path === "string" && path ? path : null;
  };

  // Only paths under this user's session folder are signed. The admin client
  // bypasses storage RLS, so this is the ownership check.
  const paths = [...new Set(messages.map(pathOf).filter((p): p is string => p !== null))];
  const foreign = paths.filter((p) => !p.startsWith(prefix));
  if (foreign.length > 0) {
    console.warn(
      `session-thumbnail: ${foreign.length} thumbnail path(s) outside ${prefix} not signed for session ${sessionId}`
    );
  }
  const signable = paths.filter((p) => p.startsWith(prefix));

  const urls = new Map<string, string>();
  if (signable.length > 0) {
    try {
      const { data, error } = await createAdminClient()
        .storage.from(THUMBNAIL_BUCKET)
        .createSignedUrls(signable, THUMBNAIL_URL_TTL_S);
      if (error) {
        console.warn(
          `session-thumbnail: signing thumbnails from "${THUMBNAIL_BUCKET}" failed for session ${sessionId}: ${error.message}`
        );
      } else {
        const failed = data.filter((d) => d.error || !d.signedUrl || !d.path);
        for (const d of data) {
          if (!d.error && d.signedUrl && d.path) urls.set(d.path, d.signedUrl);
        }
        if (failed.length > 0) {
          console.warn(
            `session-thumbnail: ${failed.length} thumbnail(s) from "${THUMBNAIL_BUCKET}" not signed for session ${sessionId}: ${failed[0].error ?? "no URL returned"}`
          );
        }
      }
    } catch (err) {
      console.warn(
        `session-thumbnail: signing thumbnails from "${THUMBNAIL_BUCKET}" threw for session ${sessionId}:`,
        err
      );
    }
  }

  return messages.map((m) => {
    if (m.role !== "user" || !m.content || typeof m.content !== "object") return m;
    const { thumbnailPath: _path, ...rest } = m.content as Record<string, unknown>;
    const path = pathOf(m);
    return { ...m, content: { ...rest, thumbnailUrl: path ? (urls.get(path) ?? null) : null } };
  });
}
