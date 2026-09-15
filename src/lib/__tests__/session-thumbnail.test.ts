import { describe, it, expect, beforeEach, vi } from "vitest";

const { storage, uploadSpy, removeSpy, updateSpy, selectEqSpy, updateEqSpy, messageRow } = vi.hoisted(() => {
  const uploadSpy = vi.fn();
  const removeSpy = vi.fn(async () => ({ data: null, error: null }));
  const updateSpy = vi.fn();
  const selectEqSpy = vi.fn();
  const updateEqSpy = vi.fn(async (..._args: unknown[]) => ({ error: null }));
  const messageRow: { current: Record<string, unknown> | null } = { current: null };
  const storage = { from: vi.fn(() => ({ upload: uploadSpy, remove: removeSpy })) };
  return { storage, uploadSpy, removeSpy, updateSpy, selectEqSpy, updateEqSpy, messageRow };
});

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    storage,
    from: vi.fn(() => {
      const b: Record<string, unknown> = {};
      b.select = () => b;
      b.eq = (col: string, val: unknown) => {
        selectEqSpy(col, val);
        return b;
      };
      b.order = () => {
        throw new Error("thumbnail lookup must not order by recency");
      };
      b.maybeSingle = async () => ({ data: messageRow.current, error: null });
      b.update = (payload: unknown) => {
        updateSpy(payload);
        return { eq: updateEqSpy };
      };
      return b;
    }),
  })),
}));

import { persistSessionThumbnail, THUMBNAIL_BUCKET, THUMBNAIL_PERSISTENCE_ENABLED } from "../session-thumbnail";

const ARGS = { userId: "user-1", sessionId: "sess-1", messageId: "msg-1", thumbnailBase64: "/9j/4AAQ" };

describe("persistSessionThumbnail", () => {
  beforeEach(() => {
    uploadSpy.mockReset();
    removeSpy.mockClear();
    updateSpy.mockReset();
    selectEqSpy.mockReset();
    updateEqSpy.mockClear();
    storage.from.mockClear();
    messageRow.current = { content: { text: "a portrait", thumbnailPath: null } };
    vi.restoreAllMocks();
  });

  it("is enabled by default and targets the session-thumbnails bucket", () => {
    expect(THUMBNAIL_PERSISTENCE_ENABLED).toBe(true);
    expect(THUMBNAIL_BUCKET).toBe("session-thumbnails");
  });

  it("uploads to {user_id}/{session_id}/{uuid}.jpg and records the path on the message with that id", async () => {
    uploadSpy.mockResolvedValue({ data: {}, error: null });

    const path = await persistSessionThumbnail(ARGS);

    expect(path).toMatch(/^user-1\/sess-1\/[0-9a-f-]{36}\.jpg$/);
    expect(storage.from).toHaveBeenCalledWith("session-thumbnails");
    const [uploadPath, body, opts] = uploadSpy.mock.calls[0];
    expect(uploadPath).toBe(path);
    expect(Buffer.isBuffer(body)).toBe(true);
    expect(opts).toMatchObject({ contentType: "image/jpeg" });

    expect(selectEqSpy).toHaveBeenCalledWith("message_id", "msg-1");
    expect(updateSpy).toHaveBeenCalledWith({ content: { text: "a portrait", thumbnailPath: path } });
    expect(updateEqSpy).toHaveBeenCalledWith("message_id", "msg-1");
  });

  it("never matches on message text", async () => {
    uploadSpy.mockResolvedValue({ data: {}, error: null });
    messageRow.current = { content: { text: "different text entirely", thumbnailPath: null } };

    const path = await persistSessionThumbnail(ARGS);

    expect(path).not.toBeNull();
    expect(selectEqSpy.mock.calls.map(([col]) => col)).not.toContain("content");
    expect(updateSpy).toHaveBeenCalledWith({ content: { text: "different text entirely", thumbnailPath: path } });
  });

  it("missing bucket → one warn naming the bucket and session, null, no throw, no row update", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    uploadSpy.mockResolvedValue({ data: null, error: { message: "Bucket not found" } });

    await expect(persistSessionThumbnail(ARGS)).resolves.toBeNull();

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(String(warnSpy.mock.calls[0][0])).toContain('"session-thumbnails"');
    expect(String(warnSpy.mock.calls[0][0])).toContain("sess-1");
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it("a thrown storage error is swallowed with one warn", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    uploadSpy.mockRejectedValue(new Error("network down"));

    await expect(persistSessionThumbnail(ARGS)).resolves.toBeNull();
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it("no message with that id → upload removed, null", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    uploadSpy.mockResolvedValue({ data: {}, error: null });
    messageRow.current = null;

    await expect(persistSessionThumbnail(ARGS)).resolves.toBeNull();

    expect(removeSpy).toHaveBeenCalledTimes(1);
    expect(updateSpy).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(String(warnSpy.mock.calls[0][0])).toContain("msg-1");
  });
});
