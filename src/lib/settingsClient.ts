import type { SettingsResponse } from "@/lib/settings";

export async function requestSettings(
  conditions: string,
  sessionId: string | null,
  fakeParam?: string,
): Promise<SettingsResponse> {
  const url = fakeParam
    ? `/api/settings?fake=${encodeURIComponent(fakeParam)}`
    : "/api/settings";

  const body: Record<string, string> = { conditions };
  if (sessionId) body.session_id = sessionId;

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    // TODO(4c): handle AbortError for 30s client-abort timeout
  } catch {
    return {
      status: "error",
      message: "Couldn't reach the photography service. Try again?",
    };
  }

  if (!res.ok) {
    let errorField: string | undefined;
    try {
      const errBody = await res.json() as Record<string, unknown>;
      errorField = typeof errBody.error === "string" ? errBody.error : undefined;
    } catch {
      // unparseable body — fall through to generic
    }

    if (res.status === 429 && errorField === "quota_exceeded") {
      return {
        status: "error",
        // TODO(9.7 §4.10): replace with rich tier-aware out-of-credits card
        message:
          "You've hit your limit for now. Credits or an upgrade will let you keep going.",
      };
    }
    if (res.status === 429 && errorField === "rate_limited") {
      return {
        status: "error",
        // TODO(9.7 §4.11): replace with countdown UI
        message: "Easy — give it a moment and try again.",
      };
    }
    if (res.status === 401) {
      return {
        status: "error",
        message: "Your session expired — refresh and sign in again.",
      };
    }
    return {
      status: "error",
      message: "Something went sideways. Try again?",
    };
  }

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    return { status: "error", message: "Unexpected response." };
  }

  if (
    typeof data !== "object" ||
    data === null ||
    !("status" in data) ||
    typeof (data as Record<string, unknown>).status !== "string"
  ) {
    return { status: "error", message: "Unexpected response." };
  }

  return data as SettingsResponse;
}
