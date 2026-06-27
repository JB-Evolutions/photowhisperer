"use client";

import { useState, useRef } from "react";
import type { SettingsResponse } from "@/lib/settings";
import { requestSettings } from "@/lib/settingsClient";
import UserMessage from "@/components/app/UserMessage";
import AssistantResponse from "@/components/app/AssistantResponse";

export type Message =
  | { role: "user"; text: string }
  | { role: "assistant"; response: SettingsResponse };

interface SessionViewProps {
  fakeParam?: string;
}

export default function SessionView({ fakeParam }: SessionViewProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function send(text: string) {
    if (pending || !text.trim()) return;

    setMessages((prev) => [...prev, { role: "user", text }]);
    setPending(true);

    const result = await requestSettings(text, sessionId, fakeParam);

    if (result.status === "ok" && result.session_id) {
      setSessionId(result.session_id);
    }

    setMessages((prev) => [...prev, { role: "assistant", response: result }]);
    setPending(false);
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
        // TODO(4c): replace with full §4.4 skeleton + 8s/20s/30s timers
        <div className="flex items-center gap-2 px-4 py-3 text-sm text-text-muted">
          <span
            className="inline-block h-2 w-2 rounded-full bg-accent"
            aria-hidden="true"
          />
          PhotoWhisperer · thinking…
        </div>
      )}

      {/* TODO(4c): replace with AppShell ChatComposer wiring */}
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
