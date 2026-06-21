// Server-only. Per arch-spec-v3.1.md §2.6/§2.7: sessions and session_messages
// have no client INSERT/UPDATE RLS policy, so all writes here go through the
// service-role client and bypass RLS.
import { createAdminClient } from "./supabase/admin";

export interface EnsureSessionResult {
  session_id: string;
  was_created: boolean;
}

export async function ensureSession(
  userId: string,
  sessionId?: string | null
): Promise<EnsureSessionResult> {
  const admin = createAdminClient();

  if (sessionId) {
    const { data, error } = await admin
      .from("sessions")
      .select("session_id")
      .eq("session_id", sessionId)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;
    if (data) {
      return { session_id: data.session_id, was_created: false };
    }
  }

  const { data, error } = await admin
    .from("sessions")
    .insert({ user_id: userId, title: null })
    .select("session_id")
    .single();
  if (error) throw error;

  return { session_id: data.session_id, was_created: true };
}

export async function appendMessages(
  sessionId: string,
  userContent: { text: string },
  assistantContent: Record<string, unknown>
): Promise<void> {
  const admin = createAdminClient();

  const { error } = await admin.from("session_messages").insert([
    { session_id: sessionId, role: "user", content: userContent },
    { session_id: sessionId, role: "assistant", content: assistantContent },
  ]);
  if (error) throw error;
}

export async function updateSessionTitle(
  sessionId: string,
  title: string
): Promise<void> {
  const admin = createAdminClient();

  const { error } = await admin
    .from("sessions")
    .update({ title: title.slice(0, 80), updated_at: new Date().toISOString() })
    .eq("session_id", sessionId);
  if (error) throw error;
}

export function generateTitleFromSummary(sceneSummary: string): string {
  const trimmed = sceneSummary.trim();
  const firstSentence = (trimmed.match(/^[^.!?]+[.!?]?/)?.[0] ?? trimmed).trim();

  if (firstSentence.length <= 80) {
    return firstSentence;
  }
  return trimmed.slice(0, 80).trim();
}
