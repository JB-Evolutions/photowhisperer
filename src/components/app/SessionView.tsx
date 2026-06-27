"use client";

import { useState, useRef, useEffect } from "react";
import type { SettingsResponse } from "@/lib/settings";
import { requestSettings } from "@/lib/settingsClient";
import UserMessage from "@/components/app/UserMessage";
import AssistantResponse from "@/components/app/AssistantResponse";
import LoadingSkeleton from "@/components/app/LoadingSkeleton";

export type Message =
  | { role: "user"; text: string }
  | { role: "assistant"; response: SettingsResponse };

const DEFAULT_HEADER = "PhotoWhisperer · thinking…";

interface SessionViewProps {
  fakeParam?: string;
}

export default function SessionView({ fakeParam }: SessionViewProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [headerText, setHeaderText] = useState(DEFAULT_HEADER);
  const [showSlowRetry, setShowSlowRetry] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const inFlightConditions = useRef<string>("");
  // Mirrors pending state but updated synchronously so send()'s guard
  // and the 20s retry handler agree without waiting for a re-render.
  const pendingRef = useRef(false);
  // Incremented on each send(); after the await, a stale id means this
  // result was superseded by a newer send() — discard without side-effects.
  const requestIdRef = useRef(0);
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

    const controller = new AbortController();
    abortControllerRef.current = controller;
    inFlightConditions.current = text;

    const requestId = ++requestIdRef.current;

    setMessages((prev) => [...prev, { role: "user", text }]);
    pendingRef.current = true;
    setPending(true);

    timer8Ref.current  = setTimeout(() => setHeaderText("Still thinking…"), 8000);
    timer20Ref.current = setTimeout(() => setShowSlowRetry(true), 20000);
    timer30Ref.current = setTimeout(() => controller.abort(), 30000);

    const result = await requestSettings(text, sessionId, fakeParam, controller.signal);

    // A newer send() superseded this one (20s retry was clicked) — discard.
    if (requestId !== requestIdRef.current) return;

    resetPendingState();

    if (result.status === "ok" && result.session_id) {
      setSessionId(result.session_id);
    }

    setMessages((prev) => [...prev, { role: "assistant", response: result }]);
  }

  return (
    <div className="flex flex-col gap-4">
      {messages.map((msg, i) =>
        msg.role === "user" ? (
          <UserMessage key={i} text={msg.text} />
        ) : (
          <AssistantResponse key={i} response={msg.response} />
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

      {/* TODO(4c-3): replace with AppShell ChatComposer wiring */}
      <div className="flex gap-2 border-t border-border pt-4">
        <input
          ref={inputRef}
          type="text"
          placeholder="Describe your scene…"
          disabled={pending}
          className={[
            "flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text",
            "placeholder:text-text-dim",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-accent)]",
            "disabled:opacity-50",
          ].join(" ")}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              const val = inputRef.current?.value ?? "";
              if (inputRef.current) inputRef.current.value = "";
              send(val);
            }
          }}
        />
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            const val = inputRef.current?.value ?? "";
            if (inputRef.current) inputRef.current.value = "";
            send(val);
          }}
          className={[
            "rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text",
            "transition-colors duration-200 ease-[cubic-bezier(0.2,0,0,1)]",
            "hover:bg-surface-2 disabled:opacity-50",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-accent)]",
          ].join(" ")}
        >
          Send
        </button>
      </div>
    </div>
  );
}
