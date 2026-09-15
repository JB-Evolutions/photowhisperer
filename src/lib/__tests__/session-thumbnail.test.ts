import { describe, it, expect, beforeEach, vi } from "vitest";

const { storage, uploadSpy, removeSpy, updateSpy, messageRow } = vi.hoisted(() => {
  const uploadSpy = vi.fn();
  const removeSpy = vi.fn(async () => ({ data: null, error: null }));
  const updateSpy = vi.fn();
  const messageRow: { current: Record<string, unknown> | null } = { current: null };
  const storage = { from: vi.fn(() => ({ upload: uploadSpy, remove: removeSpy })) };
  return { storage, uploadSpy, removeSpy, updateSpy, messageRow };
});

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    storage,
    from: vi.fn(() => {
      const b: Record<string, unknown> = {};
      b.select = () => b;
      b.eq = () => b;
      b.order = () => b;
      b.limit = () => b;
      b.maybeSingle = async () => ({ data: messageRow.current, error: null });
      b.update = (payload: unknown) => {
        updateSpy(payload);
        return { eq: async () => ({ error: null }) };
      };
      return b;
    }),
  })),
}));

import { persistSessionThumbnail, THUMBNAIL_BUCKET, THUMBNAIL_PERSISTENCE_ENABLED } from "../session-thumbnail";

const ARGS = { userId: "user-1", sessionId: "sess-1", text: "a portrait", thumbnailBase64: "/9j/4AAQ" };

describe("persistSessionThumbnail", () => {
  beforeEach(() => {
    uploadSpy.mockReset();
    removeSpy.mockClear();
    updateSpy.mockReset();
    storage.from.mockClear();
    messageRow.current = { message_id: "msg-1", content: { text: "a portrait", thumbnailPath: null } };
    vi.restoreAllMocks();
  });

  it("is enabled by default and targets the session-thumbnails bucket", () => {
    expect(THUMBNAIL_PERSISTENCE_ENABLED).toBe(true);
    expect(THUMBNAIL_BUCKET).toBe("session-thumbnails");
  });

  it("uploads to {user_id}/{session_id}/{uuid}.jpg and records the path on the user message", async () => {
    uploadSpy.mockResolvedValue({ data: {}, error: null });

    const path = await persistSessionThumbnail(ARGS);

    expect(path).toMatch(/^user-1\/sess-1\/[0-9a-f-]{36}\.jpg$/);
    expect(storage.from).toHaveBeenCalledWith("session-thumbnails");
    const [uploadPath, body, opts] = uploadSpy.mock.calls[0];
    expect(uploadPath).toBe(path);
    expect(Buffer.isBuffer(body)).toBe(true);
    expect(opts).toMatchObject({ contentType: "image/jpeg" });
    expect(updateSpy).toHaveBeenCalledWith({ content: { text: "a portrait", thumbnailPath: path } });
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

  it("no matching user message → upload removed, null", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    uploadSpy.mockResolvedValue({ data: {}, error: null });
    messageRow.current = { message_id: "msg-2", content: { text: "something else", thumbnailPath: null } };

    await expect(persistSessionThumbnail(ARGS)).resolves.toBeNull();

    expect(removeSpy).toHaveBeenCalledTimes(1);
    expect(updateSpy).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });
});
