import type { SettingsRequestBody, SettingsResponse } from "@/lib/settings";

export async function requestSettings(
  conditions: string,
  sessionId: string | null,
  priorContext?: { user_msg: string; assistant_summary: string },
  signal?: AbortSignal,
): Promise<SettingsResponse> {
  const url = "/api/settings";

  const body: SettingsRequestBody = { conditions };
  if (sessionId) body.session_id = sessionId;
  if (priorContext && priorContext.assistant_summary) {
    body.prior_context = priorContext;
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      return { status: "error", message: "Request timed out — try again?" };
    }
    return {
      status: "error",
      message: "Couldn't reach the photography service. Try again?",
    };
  }

  if (!res.ok) {
    let errorField: string | undefined;
    let errorMonthlyCount: number | undefined;
    let errorCreditsRemaining: number | undefined;
    try {
      const errBody = await res.json() as Record<string, unknown>;
      errorField = typeof errBody.error === "string" ? errBody.error : undefined;
      errorMonthlyCount = typeof errBody.monthly_count === "number" ? errBody.monthly_count : undefined;
      errorCreditsRemaining = typeof errBody.credits_remaining === "number" ? errBody.credits_remaining : undefined;
    } catch {
      // unparseable body — fall through to generic
    }

    if (res.status === 429 && errorField === "quota_exceeded") {
      // Dedicated status, not "error" — §4.10 wants only the OutOfCreditsCard,
      // not a chat bubble. Reusing "error" here previously caused a
      // redundant, off-spec ErrorCard bubble to render alongside the correct
      // card. Fields are passed through as-is (undefined if the body lacked
      // them) — never fabricated, since a fake 0 would corrupt account state
      // (see AppShell's forceOutOfCredits for how the card still shows
      // without them).
      return {
        status: "quota_exceeded",
        monthly_count: errorMonthlyCount,
        credits_remaining: errorCreditsRemaining,
      };
    }
    if (res.status === 429 && errorField === "rate_limited") {
      return { status: "rate_limited" };
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
