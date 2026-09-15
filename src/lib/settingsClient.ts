import type { SettingsRequestBody, SettingsResponse, SettingsResponseOk } from "@/lib/settings";
import type { BrightnessIntent, LightCondition } from "@/lib/contract/types";
import type { ExifExposure, Histogram } from "@/lib/exposure/types";

export type SettingsImagePayload = {
  jpegBase64: string;
  thumbnailBase64: string;
  exif: ExifExposure | null;
  rawExifFlags: { hdrSuspect: boolean };
  histogram: Histogram;
};

// Rides on every request: the composer's session-scoped condition selector.
export type SettingsRequestExtras = {
  condition: LightCondition | null;
  intent: BrightnessIntent;
  image?: SettingsImagePayload;
};

// aperture null renders "widest your lens allows". floorExplain and
// shortfallStops are always sent by the structured route, but sessions stored
// before it lack them — hence optional here.
export type ExposureSettingsResponseOk = Omit<SettingsResponseOk, "aperture"> & {
  aperture: string | null;
  floorExplain?: string;
  shortfallStops?: number;
};

export type ClientSettingsResponse =
  | Exclude<SettingsResponse, SettingsResponseOk>
  | ExposureSettingsResponseOk
  | { status: "payload_too_large" }
  // Photo request needed more units than were left. Charging is
  // all-or-nothing, so nothing was consumed.
  | { status: "quota_exhausted"; units_required: number; units_available: number };

export async function requestSettings(
  conditions: string,
  sessionId: string | null,
  priorContext?: { user_msg: string; assistant_summary: string },
  signal?: AbortSignal,
  extras?: SettingsRequestExtras,
): Promise<ClientSettingsResponse> {
  const url = "/api/settings";

  const body: SettingsRequestBody & Partial<SettingsRequestExtras> = { conditions };
  if (sessionId) body.session_id = sessionId;
  if (priorContext && priorContext.assistant_summary) {
    body.prior_context = priorContext;
  }
  if (extras) {
    body.condition = extras.condition;
    body.intent = extras.intent;
    if (extras.image) body.image = extras.image;
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
    let errorMessage: string | undefined;
    let errorMonthlyCount: number | undefined;
    let errorCreditsRemaining: number | undefined;
    let errorUnitsRequired: number | undefined;
    let errorUnitsAvailable: number | undefined;
    try {
      const errBody = await res.json() as Record<string, unknown>;
      errorField = typeof errBody.error === "string" ? errBody.error : undefined;
      errorMessage = typeof errBody.message === "string" ? errBody.message : undefined;
      errorMonthlyCount = typeof errBody.monthly_count === "number" ? errBody.monthly_count : undefined;
      errorCreditsRemaining = typeof errBody.credits_remaining === "number" ? errBody.credits_remaining : undefined;
      errorUnitsRequired = typeof errBody.units_required === "number" ? errBody.units_required : undefined;
      errorUnitsAvailable = typeof errBody.units_available === "number" ? errBody.units_available : undefined;
    } catch {
      // unparseable body — fall through to generic
    }

    // Any 413 — the platform can reject an oversized body before the route
    // runs, without the route's JSON shape.
    if (res.status === 413) {
      return { status: "payload_too_large" };
    }

    if (
      res.status === 429 &&
      errorField === "quota_exhausted" &&
      errorUnitsRequired !== undefined &&
      errorUnitsAvailable !== undefined
    ) {
      return {
        status: "quota_exhausted",
        units_required: errorUnitsRequired,
        units_available: errorUnitsAvailable,
      };
    }

    if (res.status === 400 && errorField === "validation" && errorMessage) {
      // Surfaces route.ts's own message (e.g. the 1000-char limit) instead
      // of the generic fallback, which reads as a server fault rather than
      // a rejected input. Falls through to generic below if the body was
      // unparseable or missing a message — never fabricate one.
      return { status: "error", message: errorMessage };
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
    if (res.status === 503 && errorField === "service_busy") {
      // Dedicated status, not "error" — carved out the same way quota_exceeded
      // was, so ServiceBusyCard renders instead of the generic ErrorCard.
      // Covers both 503 sources: the Upstash rate-limiter failing closed and
      // an Anthropic classifier overload (429/503/529), both surfaced by
      // route.ts with this identical { error: "service_busy" } shape.
      return { status: "service_busy" };
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

  return data as ClientSettingsResponse;
}
