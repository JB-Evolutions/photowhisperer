"use client";

import { useEffect, useRef, forwardRef, useImperativeHandle } from "react";

const PLACEHOLDER = "Describe your shot: light, subject, lens, mood…";

const sendButtonClass = [
  "flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl",
  "bg-accent text-[var(--tile-text-on-accent)]",
  "transition-[opacity,transform] duration-200 ease-[cubic-bezier(0.2,0,0,1)]",
  "hover:opacity-90 active:scale-[0.97]",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent",
  "disabled:cursor-not-allowed disabled:opacity-40",
].join(" ");

export interface ChatComposerHandle {
  focus: () => void;
}

interface ChatComposerProps {
  value: string;
  onChange: (v: string) => void;
  onSend: (text: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

const ChatComposer = forwardRef<ChatComposerHandle, ChatComposerProps>(
  function ChatComposer(
    { value, onChange, onSend, disabled = false, placeholder = PLACEHOLDER },
    ref,
  ) {
    const containerRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    useImperativeHandle(ref, () => ({ focus: () => textareaRef.current?.focus() }), []);

    // height="auto" first lets scrollHeight shrink when lines are deleted.
    useEffect(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    }, [value]);

    function handleSend() {
      if (disabled) return;
      const trimmed = value.trim();
      if (!trimmed) { triggerShake(); return; }
      onSend(trimmed);
    }

    function triggerShake() {
      const el = containerRef.current;
      if (!el) return;
      const rm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const cls = rm ? "pw-composer-flash" : "pw-composer-shake";
      el.classList.remove(cls);
      void el.offsetWidth; // force reflow so animation restarts on rapid re-trigger
      el.classList.add(cls);
      if (rm) {
        // Container's transition-colors animates the border back when class is removed.
        setTimeout(() => el.classList.remove(cls), 300);
      } else {
        el.addEventListener("animationend", () => el.classList.remove(cls), { once: true });
      }
    }

    const sendEnabled = !disabled && value.trim().length > 0;

    return (
      <div
        ref={containerRef}
        className={`flex min-h-[56px] items-end gap-3 rounded-2xl border px-4 py-3 transition-colors duration-200 ease-[cubic-bezier(0.2,0,0,1)] ${
          disabled
            ? "cursor-not-allowed border-border bg-surface-2"
            : "border-border bg-surface"
        }`}
      >
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          readOnly={disabled}
          aria-disabled={disabled || undefined}
          placeholder={placeholder}
          rows={1}
          maxLength={1000}
          className={`max-h-[140px] min-h-[24px] flex-1 self-center resize-none overflow-y-auto bg-transparent text-sm leading-relaxed text-text outline-none placeholder:text-text-dim ${
            disabled ? "cursor-not-allowed" : ""
          }`}
        />

        <button
          type="button"
          aria-label="Send"
          disabled={!sendEnabled}
          onClick={handleSend}
          className={sendButtonClass}
        >
          <svg
            viewBox="0 0 24 24"
            width="15"
            height="15"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </div>
    );
  },
);

export default ChatComposer;
