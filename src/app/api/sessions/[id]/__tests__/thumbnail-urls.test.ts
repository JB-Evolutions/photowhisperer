import { describe, it, expect, beforeEach, vi } from "vitest";

const USER_ID = "user-1";
const SESSION_ID = "sess-1";
const PATH = `${USER_ID}/${SESSION_ID}/thumb-1.jpg`;

const { rows, createSignedUrlsSpy, storageFromSpy } = vi.hoisted(() => ({
  rows: { messages: [] as Array<Record<string, unknown>> },
  createSignedUrlsSpy: vi.fn(),
  storageFromSpy: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: async () => ({ data: { user: { id: USER_ID } } }) },
    from: (table: string) => {
      const b: Record<string, unknown> = {};
      b.select = () => b;
      b.eq = () => b;
      b.maybeSingle = async () => ({ data: { session_id: SESSION_ID, title: "Portrait" }, error: null });
      b.order = async () => ({ data: table === "session_messages" ? rows.messages : null, error: null });
      return b;
    },
  })),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    storage: {
      from: (bucket: string) => {
        storageFromSpy(bucket);
        return { createSignedUrls: createSignedUrlsSpy };
      },
    },
  })),
}));

import { GET } from "../route";

async function get() {
  const res = await GET(new Request(`http://localhost/api/sessions/${SESSION_ID}`), {
    params: Promise.resolve({ id: SESSION_ID }),
  });
  return { status: res.status, body: await res.json() };
}

const userMsg = (content: Record<string, unknown>) => ({
  message_id: "m-user",
  role: "user",
  content,
  created_at: "2026-09-16T10:00:00Z",
});
const assistantMsg = {
  message_id: "m-asst",
  role: "assistant",
  content: { status: "ok", aperture: "f/2.8" },
  created_at: "2026-09-16T10:00:01Z",
};

describe("GET /api/sessions/[id] — thumbnail URLs", () => {
  beforeEach(() => {
    createSignedUrlsSpy.mockReset();
    storageFromSpy.mockReset();
    vi.restoreAllMocks();
  });

  it("a user message with a thumbnailPath gets a 1-hour signed URL, and the path is not returned", async () => {
    rows.messages = [userMsg({ text: "portrait", thumbnailPath: PATH }), assistantMsg];
    createSignedUrlsSpy.mockResolvedValue({
      data: [{ path: PATH, signedUrl: "https://project.supabase.co/storage/v1/object/sign/x?token=t", error: null }],
      error: null,
    });

    const { status, body } = await get();

    expect(status).toBe(200);
    expect(storageFromSpy).toHaveBeenCalledWith("session-thumbnails");
    expect(createSignedUrlsSpy).toHaveBeenCalledWith([PATH], 3600);
    expect(body.messages[0].content).toEqual({
      text: "portrait",
      thumbnailUrl: "https://project.supabase.co/storage/v1/object/sign/x?token=t",
    });
    expect(JSON.stringify(body)).not.toContain(PATH);
    expect(body.messages[1]).toEqual(assistantMsg);
  });

  it("signing failure (bucket missing) → thumbnailUrl null, one warn naming the bucket, session still returned", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    rows.messages = [userMsg({ text: "portrait", thumbnailPath: PATH }), assistantMsg];
    createSignedUrlsSpy.mockResolvedValue({ data: null, error: { message: "Bucket not found" } });

    const { status, body } = await get();

    expect(status).toBe(200);
    expect(body.session_id).toBe(SESSION_ID);
    expect(body.title).toBe("Portrait");
    expect(body.messages).toHaveLength(2);
    expect(body.messages[0].content).toEqual({ text: "portrait", thumbnailUrl: null });
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(String(warnSpy.mock.calls[0][0])).toContain('"session-thumbnails"');
  });

  it("a thrown signing error is also swallowed → null, 200", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    rows.messages = [userMsg({ text: "portrait", thumbnailPath: PATH })];
    createSignedUrlsSpy.mockRejectedValue(new Error("fetch failed"));

    const { status, body } = await get();

    expect(status).toBe(200);
    expect(body.messages[0].content).toEqual({ text: "portrait", thumbnailUrl: null });
  });

  it("a user message with no thumbnailPath → thumbnailUrl null (not undefined), no signing call", async () => {
    rows.messages = [
      userMsg({ text: "overcast portrait" }),
      { ...userMsg({ text: "photo, upload pending", thumbnailPath: null }), message_id: "m-user-2" },
    ];

    const { status, body } = await get();

    expect(status).toBe(200);
    expect(createSignedUrlsSpy).not.toHaveBeenCalled();
    for (const m of body.messages) {
      expect(m.content).toHaveProperty("thumbnailUrl", null);
      expect(m.content).not.toHaveProperty("thumbnailPath");
    }
  });

  it("a path outside this user's session folder is not signed", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    rows.messages = [userMsg({ text: "portrait", thumbnailPath: "someone-else/sess-9/x.jpg" })];

    const { status, body } = await get();

    expect(status).toBe(200);
    expect(createSignedUrlsSpy).not.toHaveBeenCalled();
    expect(body.messages[0].content).toEqual({ text: "portrait", thumbnailUrl: null });
  });
});
