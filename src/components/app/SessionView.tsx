"use client";

import { useState, useRef, useEffect, forwardRef, useImperativeHandle } from "react";
import type { BodyProfile, BrightnessIntent, LightCondition } from "@/lib/contract/types";
import { requestSettings, type SettingsImagePayload } from "@/lib/settingsClient";
import { useToastContext } from "@/components/app/useToast";
import UserMessage, { type UserMessagePhoto } from "@/components/app/UserMessage";
import AssistantResponse from "@/components/app/AssistantResponse";
import LoadingSkeleton from "@/components/app/LoadingSkeleton";
import {
  attachmentErrorKind,
  buildImagePayload,
  jpegDataUri,
  type ComposerAttachment,
  type ThreadResponse,
} from "@/components/app/photoAttachment";
import { CLARIFICATION_CHIPS, DEFAULT_INTENT, type ClarificationChip } from "@/components/app/conditions";

export type Message =
  | { role: "user"; text: string; photo?: UserMessagePhoto | null }
  // withChips: the one clarification per session that offers brightness chips.
  | { role: "assistant"; response: ThreadResponse; withChips?: boolean };

interface SessionMessageRow {
  message_id: string;
  role: "user" | "assistant";
  content: Record<string, unknown>;
  created_at: string;
}

// A photo already prepared, carried so a retry, chip tap or 20s retry can
// resend it without preparing it again.
type SentImage = { payload: SettingsImagePayload; src: string; name: string | null };

export interface SendOptions {
  // Composer attachment, possibly still preparing.
  attachment?: ComposerAttachment | null;
  image?: SentImage | null;
  // Overrides the session's condition for this one request (a chip tap).
  condition?: LightCondition | null;
  // Show the photo in the user bubble. Off for a chip tap.
  echoPhoto?: boolean;
}

type LastRequest = { text: string; image: SentImage | null; condition: LightCondition | null | undefined };

export interface SessionViewHandle {
  send: (text: string, opts?: SendOptions) => void;
  // False while a request is in flight — send() would ignore the call.
  canSend: () => boolean;
  clearPendingRefinement: () => void;
  reset: () => void;
  loadSession: (id: string) => Promise<void>;
}

const DEFAULT_HEADER = "PhotographyWhisperer · thinking…";
const READING_HEADER = "PhotographyWhisperer · reading your photo…";

interface SessionViewProps {
  onRequestFocus?: () => void;
  onThreadEmptyChange?: (isEmpty: boolean) => void;
  onUsageUpdate?: (update: { monthly_count: number; credits_remaining: number }) => void;
  onRateLimit?: () => void;
  onQuotaExceeded?: () => void;
  // Fired only for a genuine status:"ok" response — the sole signal AppShell
  // uses to clear a forced out-of-credits state. Deliberately independent of
  // onUsageUpdate (which also fires for quota_exceeded-with-numbers) so
  // clearing never depends on setState batching order relative to
  // onQuotaExceeded.
  onRequestSucceeded?: () => void;
  onPreFillComposer?: (text: string) => void;
  // Mirrors the in-flight flag so AppShell can disable the controls above the
  // composer while a request runs. Driven off the `pending` state rather than
  // called at each site, so every completion path — ok, error, quota,
  // rate-limit, abort — reports through the one place that clears it.
  onPendingChange?: (pending: boolean) => void;
  // Fired whenever the active session id changes — new session created by
  // send(), a past session loaded via loadSession(), or cleared by reset().
  // Single callback so AppShell tracks one thing instead of three.
  onSessionIdChange?: (id: string | null) => void;
  // Session-scoped condition selector, sent on every request.
  condition?: LightCondition | null;
  intent?: BrightnessIntent;
  isoMode?: BodyProfile["isoMode"] | null;
  // A clarification chip was tapped — AppShell mirrors it into the selector.
  onConditionChosen?: (condition: LightCondition) => void;
  onTryAnotherPhoto?: () => void;
}

// History rows may carry a thumbnail as a signed URL or inline base64,
// depending on what the sessions route returns. Read defensively.
function storedThumbnail(content: Record<string, unknown>): string | null {
  const { thumbnailUrl, thumbnailBase64, image } = content as {
    thumbnailUrl?: unknown;
    thumbnailBase64?: unknown;
    image?: { thumbnailBase64?: unknown } | null;
  };
  if (typeof thumbnailUrl === "string" && thumbnailUrl.startsWith("https://")) return thumbnailUrl;
  if (typeof thumbnailBase64 === "string" && thumbnailBase64) return jpegDataUri(thumbnailBase64);
  if (image && typeof image.thumbnailBase64 === "string" && image.thumbnailBase64) {
    return jpegDataUri(image.thumbnailBase64);
  }
  return null;
}

const SessionView = forwardRef<SessionViewHandle, SessionViewProps>(
  function SessionView(
    {
      onRequestFocus,
      onThreadEmptyChange,
      onUsageUpdate,
      onRateLimit,
      onQuotaExceeded,
      onRequestSucceeded,
      onPreFillComposer,
      onPendingChange,
      onSessionIdChange,
      condition = null,
      intent = DEFAULT_INTENT,
      isoMode = null,
      onConditionChosen,
      onTryAnotherPhoto,
    },
    ref,
  ) {
    const showToast = useToastContext();
    const [messages, setMessages] = useState<Message[]>([]);
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [pending, setPending] = useState(false);
    const [stage, setStage] = useState<"reading" | "thinking">("thinking");
    const [headerText, setHeaderText] = useState(DEFAULT_HEADER);
    const [showSlowRetry, setShowSlowRetry] = useState(false);
    const [invalidCount, setInvalidCount] = useState(0);
    const [retryCount, setRetryCount] = useState(0);

    const abortControllerRef = useRef<AbortController | null>(null);
    const inFlightRequest = useRef<LastRequest>({ text: "", image: null, condition: undefined });
    const lastRequest = useRef<LastRequest>({ text: "", image: null, condition: undefined });
    const lastConditions = useRef<string>("");
    const lastSceneSummary = useRef<string | null>(null);
    const clarificationOriginRef = useRef<string | null>(null);
    const pendingRefineContextRef = useRef<{ user_msg: string; assistant_summary: string } | null>(null);
    const pendingClarificationContextRef = useRef<{ user_msg: string; assistant_summary: string } | null>(null);
    // Tracks consecutive clarification_required responses. Must be a ref (not state)
    // because send() reads it before the await; useState would stale-close inside the
    // [sessionId] useImperativeHandle and suppression would never fire.
    const clarificationCountRef = useRef(0);
    // Brightness chips are offered at most once per session.
    const chipsOfferedRef = useRef(false);
    // Mirrors pending state but updated synchronously so send()'s guard
    // and the 20s retry handler agree without waiting for a re-render.
    const pendingRef = useRef(false);
    // Incremented on each send(); after the await, a stale id means this
    // result was superseded by a newer send() — discard without side-effects.
    const requestIdRef = useRef(0);
    const hasNotifiedRef = useRef(false);
    const timer8Ref  = useRef<ReturnType<typeof setTimeout> | null>(null);
    const timer20Ref = useRef<ReturnType<typeof setTimeout> | null>(null);
    const timer30Ref = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Props read by send(), which the [sessionId] imperative handle closes over.
    const conditionRef = useRef(condition);
    const intentRef = useRef(intent);
    useEffect(() => {
      conditionRef.current = condition;
      intentRef.current = intent;
    }, [condition, intent]);

    function clearTimers() {
      if (timer8Ref.current)  { clearTimeout(timer8Ref.current);  timer8Ref.current  = null; }
      if (timer20Ref.current) { clearTimeout(timer20Ref.current); timer20Ref.current = null; }
      if (timer30Ref.current) { clearTimeout(timer30Ref.current); timer30Ref.current = null; }
    }

    function resetPendingState() {
      clearTimers();
      pendingRef.current = false;
      setPending(false);
      setStage("thinking");
      setHeaderText(DEFAULT_HEADER);
      setShowSlowRetry(false);
    }

    useEffect(() => {
      return () => {
        clearTimers();
        abortControllerRef.current?.abort();
      };
    }, []);

    useEffect(() => {
      onPendingChange?.(pending);
    }, [pending, onPendingChange]);

    async function send(text: string, opts: SendOptions = {}) {
      const { attachment = null, condition: conditionOverride, echoPhoto = true } = opts;
      let image = opts.image ?? null;
      if (pendingRef.current) return;
      if (!text.trim() && !attachment && !image) return;

      // If the classifier has already asked 2 consecutive clarifications, append a
      // suppression directive so it produces a best-effort answer this turn. Also
      // permits invalid_input explicitly — without this, a genuinely empty third
      // input has no exit once clarification_required is blocked, and the
      // classifier fabricates a scene instead of declining (observed 2026-07-24).
      const conditions = clarificationCountRef.current >= 2
        ? text + " — Do not ask for further clarification. If there's no usable scene information at all, return invalid_input instead of guessing; otherwise give your best recommendation with what's given."
        : text;

      // Consume both prior-context slots before first await. Refine takes
      // precedence if both are set; in practice only one ever is.
      const priorContext = pendingRefineContextRef.current ?? pendingClarificationContextRef.current;
      pendingRefineContextRef.current = null;
      pendingClarificationContextRef.current = null;

      const controller = new AbortController();
      abortControllerRef.current = controller;
      lastConditions.current = text;

      const requestId = ++requestIdRef.current;

      // The bubble shows the full prepared JPEG; a photo still preparing shows
      // a placeholder until it resolves.
      const showPhoto = echoPhoto && (attachment !== null || image !== null);
      const photoName = attachment?.name ?? image?.name ?? null;
      const userMessage: Message = {
        role: "user",
        text,
        photo: showPhoto ? { src: image?.src ?? null, name: photoName } : null,
      };
      setMessages((prev) => [...prev, userMessage]);
      if (!hasNotifiedRef.current) {
        hasNotifiedRef.current = true;
        onThreadEmptyChange?.(false);
      }
      pendingRef.current = true;
      setPending(true);

      if (attachment && !image) {
        setStage("reading");
        setHeaderText(READING_HEADER);
        let prepared;
        try {
          prepared = await attachment.promise;
        } catch (err) {
          if (requestId !== requestIdRef.current) return;
          resetPendingState();
          setMessages((prev) => [
            ...prev,
            { role: "assistant", response: { status: "photo_failed", kind: attachmentErrorKind(err) } },
          ]);
          return;
        }
        if (requestId !== requestIdRef.current) return;
        image = { payload: buildImagePayload(prepared), src: jpegDataUri(prepared.jpegBase64), name: attachment.name };
        const src = image.src;
        if (showPhoto) {
          setMessages((prev) =>
            prev.map((m) =>
              m === userMessage && m.role === "user" && m.photo ? { ...m, photo: { ...m.photo, src } } : m,
            ),
          );
        }
      }

      const request: LastRequest = { text, image, condition: conditionOverride };
      inFlightRequest.current = request;
      lastRequest.current = request;

      setStage("thinking");
      setHeaderText(DEFAULT_HEADER);

      // Escalation is measured from the start of the POST, not from when the
      // photo started preparing.
      timer8Ref.current  = setTimeout(() => setHeaderText("Still thinking…"), 8000);
      timer20Ref.current = setTimeout(() => setShowSlowRetry(true), 20000);
      timer30Ref.current = setTimeout(() => controller.abort(), 30000);

      const result = await requestSettings(conditions, sessionId, priorContext ?? undefined, controller.signal, {
        condition: conditionOverride !== undefined ? conditionOverride : conditionRef.current,
        intent: intentRef.current,
        ...(image ? { image: image.payload } : {}),
      });

      // A newer send() superseded this one (20s retry was clicked) — discard.
      if (requestId !== requestIdRef.current) return;

      resetPendingState();

      if (result.status === "rate_limited") {
        onRateLimit?.();
        setInvalidCount(0);
        setRetryCount(0);
        return;
      }

      if (result.status === "ok" && result.session_id) {
        setSessionId(result.session_id);
        onSessionIdChange?.(result.session_id);
      }

      // Propagate fresh quota numbers to AppShell's account state.
      if (result.status === "ok") {
        onUsageUpdate?.({ monthly_count: result.monthly_count, credits_remaining: result.credits_remaining });
        onRequestSucceeded?.();
        lastSceneSummary.current = result.scene_summary ?? null;
      } else if (
        (result.status === "error" || result.status === "quota_exceeded") &&
        result.monthly_count !== undefined &&
        result.credits_remaining !== undefined
      ) {
        onUsageUpdate?.({ monthly_count: result.monthly_count, credits_remaining: result.credits_remaining });
      }

      // §4.10: force the OutOfCreditsCard regardless of whether the numeric
      // fields above arrived — the card's visibility must never depend on
      // them (see settings.ts). A photo request with nothing left at all
      // lands in the same place; with 1 unit left it gets its own card.
      if (
        result.status === "quota_exceeded" ||
        (result.status === "quota_exhausted" && result.units_available <= 0)
      ) {
        onQuotaExceeded?.();
      }

      // Terminal statuses end the clarification chain — clear origin anchor.
      if (
        result.status === "ok" ||
        result.status === "error" ||
        result.status === "quota_exceeded" ||
        result.status === "quota_exhausted" ||
        result.status === "payload_too_large" ||
        result.status === "service_busy" ||
        result.status === "gear_profile_unavailable"
      ) {
        clarificationOriginRef.current = null;
      }

      // Update consecutive counters based on result status.
      if (result.status === "clarification_required") {
        clarificationCountRef.current += 1;
        setInvalidCount(0);
        setRetryCount(0);
      } else if (result.status === "invalid_input") {
        clarificationCountRef.current = 0;
        clarificationOriginRef.current = null;
        setInvalidCount((n) => n + 1);
        setRetryCount(0);
      } else if (result.status === "error") {
        clarificationCountRef.current = 0;
        setRetryCount((n) => n + 1);
        setInvalidCount(0);
      } else if (result.status === "service_busy" || result.status === "gear_profile_unavailable") {
        // Same retry-counting as "error" — 3 consecutive retries degrades
        // the card to the "Still failing? Report a problem" link. Neither
        // status charged anything, so onRetry is the plain resend.
        clarificationCountRef.current = 0;
        setRetryCount((n) => n + 1);
        setInvalidCount(0);
      } else if (
        result.status === "quota_exceeded" ||
        result.status === "quota_exhausted" ||
        result.status === "payload_too_large"
      ) {
        // No retry button ever shows for these statuses, so no point
        // incrementing retryCount.
        clarificationCountRef.current = 0;
        setInvalidCount(0);
        setRetryCount(0);
      } else {
        // ok
        clarificationCountRef.current = 0;
        setInvalidCount(0);
        setRetryCount(0);
      }

      let withChips = false;
      if (result.status === "clarification_required") {
        if (clarificationOriginRef.current === null) {
          clarificationOriginRef.current = text;
        }
        pendingClarificationContextRef.current = {
          user_msg: clarificationOriginRef.current,
          assistant_summary: "Clarifying question I asked: " + result.question,
        };
        if (image && !chipsOfferedRef.current) {
          chipsOfferedRef.current = true;
          withChips = true;
        }
      }

      setMessages((prev) => [...prev, { role: "assistant", response: result, withChips }]);

      if (result.status === "clarification_required" || result.status === "invalid_input") {
        onRequestFocus?.();
      }
    }

    function resendLast(opts: { withPhoto: boolean }) {
      const last = lastRequest.current;
      send(last.text, {
        image: opts.withPhoto ? last.image : null,
        condition: last.condition,
      });
    }

    function handleChipSelect(chip: ClarificationChip) {
      onConditionChosen?.(chip.condition);
      send(chip.label, { image: lastRequest.current.image, condition: chip.condition, echoPhoto: false });
    }

    // Tears down any in-flight send() (abort + requestId bump so a late
    // response can't land after the caller has already moved on) and clears
    // every ref send() relies on. Shared by reset() and loadSession() since
    // both replace "whatever the thread currently is" wholesale.
    function invalidateInFlight() {
      abortControllerRef.current?.abort();
      requestIdRef.current += 1;
      resetPendingState();
      hasNotifiedRef.current = false;
      clarificationCountRef.current = 0;
      clarificationOriginRef.current = null;
      pendingRefineContextRef.current = null;
      pendingClarificationContextRef.current = null;
      chipsOfferedRef.current = false;
      setInvalidCount(0);
      setRetryCount(0);
    }

    function reset() {
      invalidateInFlight();
      lastSceneSummary.current = null;
      lastConditions.current = "";
      inFlightRequest.current = { text: "", image: null, condition: undefined };
      lastRequest.current = { text: "", image: null, condition: undefined };
      setMessages([]);
      setSessionId(null);
      onSessionIdChange?.(null);
      onThreadEmptyChange?.(true);
    }

    async function loadSession(id: string) {
      invalidateInFlight();

      let rows: SessionMessageRow[];
      try {
        const res = await fetch(`/api/sessions/${id}`);
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as { messages: SessionMessageRow[] };
        rows = data.messages;
      } catch {
        showToast("Couldn't load that session — try again?");
        return;
      }

      const loaded: Message[] = rows.map((row) => {
        if (row.role === "user") {
          const src = storedThumbnail(row.content);
          return {
            role: "user",
            text: typeof row.content.text === "string" ? row.content.text : "",
            photo: src ? { src, name: null } : null,
          };
        }
        return { role: "assistant", response: row.content as unknown as ThreadResponse };
      });

      // Rehydrate refine context from the last turn so "Refine" keeps
      // working on a reloaded thread, same as it does on a live one.
      const lastUser = [...loaded].reverse().find((m) => m.role === "user");
      const lastAssistantOk = [...loaded].reverse().find(
        (m) => m.role === "assistant" && m.response.status === "ok"
      ) as (Message & { role: "assistant" }) | undefined;
      lastConditions.current = lastUser?.role === "user" ? lastUser.text : "";
      // Stored thumbnails are too small to resend, so a reloaded retry is text-only.
      lastRequest.current = { text: lastConditions.current, image: null, condition: undefined };
      lastSceneSummary.current =
        lastAssistantOk?.response.status === "ok" ? lastAssistantOk.response.scene_summary ?? null : null;

      setMessages(loaded);
      setSessionId(id);
      hasNotifiedRef.current = true;
      onSessionIdChange?.(id);
      onThreadEmptyChange?.(false);
    }

    useImperativeHandle(ref, () => ({
      send,
      canSend: () => !pendingRef.current,
      clearPendingRefinement: () => { pendingRefineContextRef.current = null; },
      reset,
      loadSession,
    }), [sessionId]);

    const lastIndex = messages.length - 1;

    return (
      <div className="flex flex-col gap-4">
        {messages.map((msg, i) =>
          msg.role === "user" ? (
            <UserMessage key={i} text={msg.text} photo={msg.photo} />
          ) : (
            <AssistantResponse
              key={i}
              response={msg.response}
              isoMode={isoMode}
              invalidCount={i === lastIndex ? invalidCount : undefined}
              retryCount={i === lastIndex ? retryCount : undefined}
              onRetry={i === lastIndex ? () => resendLast({ withPhoto: true }) : undefined}
              clarificationChips={i === lastIndex && msg.withChips ? CLARIFICATION_CHIPS : undefined}
              onChipSelect={i === lastIndex && msg.withChips ? handleChipSelect : undefined}
              onSendWithoutPhoto={
                i === lastIndex && lastRequest.current.text.trim()
                  ? () => resendLast({ withPhoto: false })
                  : undefined
              }
              onTryAnotherPhoto={i === lastIndex ? onTryAnotherPhoto : undefined}
              onRefine={
                i === lastIndex && msg.response.status === "ok"
                  ? () => {
                      // Arm BEFORE prefill — prefill triggers the stale-guard effect
                      // after render; order is intentional so the ref is set before
                      // the effect can clear it.
                      if (lastSceneSummary.current !== null) {
                        pendingRefineContextRef.current = {
                          user_msg: lastConditions.current,
                          assistant_summary: lastSceneSummary.current,
                        };
                      }
                      onPreFillComposer?.("Same scene but ");
                    }
                  : undefined
              }
              onSeeExamples={
                i === lastIndex
                  ? () => { /* TODO(4c-3): wire See-examples target */ }
                  : undefined
              }
            />
          )
        )}

        {pending && (
          <>
            <LoadingSkeleton headerText={headerText} stage={stage} />
            {showSlowRetry && (
              <button
                type="button"
                onClick={() => {
                  // Synchronously tear down current request; pendingRef.current
                  // becomes false before send() is called, bypassing its guard.
                  clearTimers();
                  abortControllerRef.current?.abort();
                  resetPendingState();
                  const inFlight = inFlightRequest.current;
                  send(inFlight.text, { image: inFlight.image, condition: inFlight.condition });
                }}
                className={[
                  "pw-pressable self-start rounded-lg border border-border px-3 py-2 text-sm text-text-muted",
                  "transition-colors duration-200 ease-[cubic-bezier(0.2,0,0,1)]",
                  "hover:bg-surface-2 hover:text-text",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-accent)]",
                ].join(" ")}
              >
                Take longer than expected? Retry
              </button>
            )}
          </>
        )}
      </div>
    );
  },
);

export default SessionView;
