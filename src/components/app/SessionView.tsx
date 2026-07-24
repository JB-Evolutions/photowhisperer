"use client";

import { useState, useRef, useEffect, forwardRef, useImperativeHandle } from "react";
import type { SettingsResponse } from "@/lib/settings";
import { requestSettings } from "@/lib/settingsClient";
import { useToastContext } from "@/components/app/useToast";
import UserMessage from "@/components/app/UserMessage";
import AssistantResponse from "@/components/app/AssistantResponse";
import LoadingSkeleton from "@/components/app/LoadingSkeleton";

export type Message =
  | { role: "user"; text: string }
  | { role: "assistant"; response: SettingsResponse };

interface SessionMessageRow {
  message_id: string;
  role: "user" | "assistant";
  content: Record<string, unknown>;
  created_at: string;
}

export interface SessionViewHandle {
  send: (text: string) => void;
  clearPendingRefinement: () => void;
  reset: () => void;
  loadSession: (id: string) => Promise<void>;
}

const DEFAULT_HEADER = "PhotoWhisperer · thinking…";

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
  // Fired whenever the active session id changes — new session created by
  // send(), a past session loaded via loadSession(), or cleared by reset().
  // Single callback so AppShell tracks one thing instead of three.
  onSessionIdChange?: (id: string | null) => void;
}

const SessionView = forwardRef<SessionViewHandle, SessionViewProps>(
  function SessionView({ onRequestFocus, onThreadEmptyChange, onUsageUpdate, onRateLimit, onQuotaExceeded, onRequestSucceeded, onPreFillComposer, onSessionIdChange }, ref) {
    const showToast = useToastContext();
    const [messages, setMessages] = useState<Message[]>([]);
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [pending, setPending] = useState(false);
    const [headerText, setHeaderText] = useState(DEFAULT_HEADER);
    const [showSlowRetry, setShowSlowRetry] = useState(false);
    const [invalidCount, setInvalidCount] = useState(0);
    const [retryCount, setRetryCount] = useState(0);

    const abortControllerRef = useRef<AbortController | null>(null);
    const inFlightConditions = useRef<string>("");
    const lastConditions = useRef<string>("");
    const lastSceneSummary = useRef<string | null>(null);
    const clarificationOriginRef = useRef<string | null>(null);
    const pendingRefineContextRef = useRef<{ user_msg: string; assistant_summary: string } | null>(null);
    const pendingClarificationContextRef = useRef<{ user_msg: string; assistant_summary: string } | null>(null);
    // Tracks consecutive clarification_required responses. Must be a ref (not state)
    // because send() reads it before the await; useState would stale-close inside the
    // [sessionId] useImperativeHandle and suppression would never fire.
    const clarificationCountRef = useRef(0);
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

    function clearTimers() {
      if (timer8Ref.current)  { clearTimeout(timer8Ref.current);  timer8Ref.current  = null; }
      if (timer20Ref.current) { clearTimeout(timer20Ref.current); timer20Ref.current = null; }
      if (timer30Ref.current) { clearTimeout(timer30Ref.current); timer30Ref.current = null; }
    }

    function resetPendingState() {
      clearTimers();
      pendingRef.current = false;
      setPending(false);
      setHeaderText(DEFAULT_HEADER);
      setShowSlowRetry(false);
    }

    useEffect(() => {
      return () => {
        clearTimers();
        abortControllerRef.current?.abort();
      };
    }, []);

    async function send(text: string) {
      if (pendingRef.current || !text.trim()) return;

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
      inFlightConditions.current = text;
      lastConditions.current = text;

      const requestId = ++requestIdRef.current;

      setMessages((prev) => [...prev, { role: "user" as const, text }]);
      if (!hasNotifiedRef.current) {
        hasNotifiedRef.current = true;
        onThreadEmptyChange?.(false);
      }
      pendingRef.current = true;
      setPending(true);

      timer8Ref.current  = setTimeout(() => setHeaderText("Still thinking…"), 8000);
      timer20Ref.current = setTimeout(() => setShowSlowRetry(true), 20000);
      timer30Ref.current = setTimeout(() => controller.abort(), 30000);

      const result = await requestSettings(conditions, sessionId, priorContext ?? undefined, controller.signal);

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
      // them (see settings.ts).
      if (result.status === "quota_exceeded") {
        onQuotaExceeded?.();
      }

      // Terminal statuses end the clarification chain — clear origin anchor.
      if (
        result.status === "ok" ||
        result.status === "error" ||
        result.status === "quota_exceeded" ||
        result.status === "service_busy"
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
      } else if (result.status === "service_busy") {
        // Same retry-counting as "error" — 3 consecutive retries degrades
        // ServiceBusyCard to the "Still failing? Report a problem" link.
        clarificationCountRef.current = 0;
        setRetryCount((n) => n + 1);
        setInvalidCount(0);
      } else if (result.status === "quota_exceeded") {
        // No retry button ever shows for this status (AssistantResponse
        // renders null), so no point incrementing retryCount.
        clarificationCountRef.current = 0;
        setInvalidCount(0);
        setRetryCount(0);
      } else {
        // ok
        clarificationCountRef.current = 0;
        setInvalidCount(0);
        setRetryCount(0);
      }

      if (result.status === "clarification_required") {
        if (clarificationOriginRef.current === null) {
          clarificationOriginRef.current = text;
        }
        pendingClarificationContextRef.current = {
          user_msg: clarificationOriginRef.current,
          assistant_summary: "Clarifying question I asked: " + result.question,
        };
      }

      setMessages((prev) => [...prev, { role: "assistant", response: result }]);

      if (result.status === "clarification_required" || result.status === "invalid_input") {
        onRequestFocus?.();
      }
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
      setInvalidCount(0);
      setRetryCount(0);
    }

    function reset() {
      invalidateInFlight();
      lastSceneSummary.current = null;
      lastConditions.current = "";
      inFlightConditions.current = "";
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

      const loaded: Message[] = rows.map((row) =>
        row.role === "user"
          ? { role: "user", text: (row.content as { text: string }).text }
          : { role: "assistant", response: row.content as unknown as SettingsResponse }
      );

      // Rehydrate refine context from the last turn so "Refine" keeps
      // working on a reloaded thread, same as it does on a live one.
      const lastUser = [...loaded].reverse().find((m) => m.role === "user");
      const lastAssistantOk = [...loaded].reverse().find(
        (m) => m.role === "assistant" && m.response.status === "ok"
      ) as (Message & { role: "assistant" }) | undefined;
      lastConditions.current = lastUser?.role === "user" ? lastUser.text : "";
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
      clearPendingRefinement: () => { pendingRefineContextRef.current = null; },
      reset,
      loadSession,
    }), [sessionId]);

    const lastIndex = messages.length - 1;

    return (
      <div className="flex flex-col gap-4">
        {messages.map((msg, i) =>
          msg.role === "user" ? (
            <UserMessage key={i} text={msg.text} />
          ) : (
            <AssistantResponse
              key={i}
              response={msg.response}
              invalidCount={i === lastIndex ? invalidCount : undefined}
              retryCount={i === lastIndex ? retryCount : undefined}
              onRetry={i === lastIndex ? () => send(lastConditions.current) : undefined}
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
            <LoadingSkeleton headerText={headerText} />
            {showSlowRetry && (
              <button
                type="button"
                onClick={() => {
                  // Synchronously tear down current request; pendingRef.current
                  // becomes false before send() is called, bypassing its guard.
                  clearTimers();
                  abortControllerRef.current?.abort();
                  resetPendingState();
                  send(inFlightConditions.current);
                }}
                className={[
                  "self-start rounded-lg border border-border px-3 py-2 text-sm text-text-muted",
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
