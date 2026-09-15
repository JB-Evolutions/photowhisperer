"use client";

import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from "react";
import PhotoPicker, { type PhotoPickerHandle } from "@/components/app/PhotoPicker";
import { ATTACHMENT_ERROR_COPY, type ComposerAttachment } from "@/components/app/photoAttachment";

const PLACEHOLDER = "Describe your shot: light, subject, lens, mood…";
const PHOTO_PLACEHOLDER = "Add any detail — lens, mood, what you're going for…";
const OFFLINE_COPY = "You're offline. Reconnect to attach a photo.";

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-accent)]";

const sendButtonClass = [
  "mb-1 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl",
  "bg-accent text-[var(--tile-text-on-accent)]",
  "transition-[opacity,transform] duration-200 ease-[cubic-bezier(0.2,0,0,1)]",
  "hover:opacity-90 active:scale-[0.97]",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent",
  "disabled:cursor-not-allowed disabled:opacity-40",
].join(" ");

export interface ChatComposerHandle {
  focus: () => void;
  openPhotoPicker: () => void;
}

interface ChatComposerProps {
  value: string;
  onChange: (v: string) => void;
  onSend: (text: string) => void;
  // Blocks typing: greys out the container, makes the textarea readOnly.
  // Reserve for states where the user genuinely cannot compose a message
  // (out of credits, rate-limited) — never for "we're still loading
  // something," which should stay typeable. See sendDisabled for that.
  disabled?: boolean;
  // Blocks sending only — textarea stays interactive. Defaults to
  // `disabled` (anything that blocks typing also blocks sending), but
  // callers can additionally disable sending without touching typeability,
  // e.g. while an account fetch that send depends on hasn't resolved yet.
  sendDisabled?: boolean;
  placeholder?: string;
  // Photo attachment. The picker only renders when onPickPhoto is given.
  attachment?: ComposerAttachment | null;
  onPickPhoto?: (file: File) => void;
  onRemoveAttachment?: () => void;
  onBeforePickerOpen?: () => void;
}

function announcement(attachment: ComposerAttachment | null, offline: boolean): string {
  if (offline) return OFFLINE_COPY;
  if (!attachment) return "";
  switch (attachment.status) {
    case "preparing":
      return `Preparing ${attachment.name}…`;
    case "ready":
      return `${attachment.name} attached.`;
    case "error":
      return attachment.errorKind ? ATTACHMENT_ERROR_COPY[attachment.errorKind] : "";
  }
}

function AttachmentThumb({ attachment }: { attachment: ComposerAttachment }) {
  if (attachment.status === "ready" && attachment.thumbnailSrc) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- data: URI, not an optimisable asset
      <img src={attachment.thumbnailSrc} alt="" className="h-12 w-12 flex-shrink-0 rounded-[8px] object-cover" />
    );
  }
  // Preparing: shimmer (a static muted fill under reduced motion). Error: muted fill.
  return (
    <div
      aria-hidden="true"
      className={`h-12 w-12 flex-shrink-0 rounded-[8px] bg-surface-3 ${attachment.status === "preparing" ? "pw-shimmer" : ""}`}
    />
  );
}

const ChatComposer = forwardRef<ChatComposerHandle, ChatComposerProps>(
  function ChatComposer(
    {
      value,
      onChange,
      onSend,
      disabled = false,
      sendDisabled = false,
      placeholder,
      attachment = null,
      onPickPhoto,
      onRemoveAttachment,
      onBeforePickerOpen,
    },
    ref,
  ) {
    const containerRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const pickerRef = useRef<PhotoPickerHandle>(null);
    const [offlineNotice, setOfflineNotice] = useState(false);
    const sendBlocked = disabled || sendDisabled;

    useImperativeHandle(ref, () => ({
      focus: () => textareaRef.current?.focus(),
      openPhotoPicker: () => pickerRef.current?.openSheet(),
    }), []);

    // height="auto" first lets scrollHeight shrink when lines are deleted.
    useEffect(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    }, [value]);

    useEffect(() => {
      if (!offlineNotice) return;
      const clear = () => setOfflineNotice(false);
      window.addEventListener("online", clear);
      return () => window.removeEventListener("online", clear);
    }, [offlineNotice]);

    // An errored attachment is never sent; a preparing one is awaited by the send.
    const hasSendableAttachment = attachment !== null && attachment.status !== "error";

    function handleSend() {
      if (sendBlocked) return;
      const trimmed = value.trim();
      if (!trimmed && !hasSendableAttachment) { triggerShake(); return; }
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

    const sendEnabled = !sendBlocked && (value.trim().length > 0 || hasSendableAttachment);
    const resolvedPlaceholder = placeholder ?? (attachment ? PHOTO_PLACEHOLDER : PLACEHOLDER);

    return (
      <div
        ref={containerRef}
        className={`flex min-h-[56px] flex-col rounded-2xl border transition-colors duration-200 ease-[cubic-bezier(0.2,0,0,1)] ${
          disabled
            ? "cursor-not-allowed border-border bg-surface-2"
            : "border-border bg-surface"
        }`}
      >
        <p aria-live="polite" className="sr-only">
          {announcement(attachment, offlineNotice)}
        </p>

        {attachment && (
          <div
            role="group"
            aria-label={`Attached photo: ${attachment.name}`}
            className="flex items-center gap-3 pl-3 pr-1 pt-1.5"
          >
            <AttachmentThumb attachment={attachment} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-text" title={attachment.name}>
                {attachment.name}
              </p>
              {attachment.status === "preparing" && (
                <p className="text-xs text-text-dim">Getting it ready…</p>
              )}
              {attachment.status === "error" && attachment.errorKind && (
                <>
                  <p className="text-xs leading-snug text-warning">
                    {ATTACHMENT_ERROR_COPY[attachment.errorKind]}
                  </p>
                  <button
                    type="button"
                    onClick={() => pickerRef.current?.openSheet()}
                    className={`inline-flex min-h-[44px] items-center rounded-md text-sm text-text underline underline-offset-2 hover:text-text-muted ${focusRing}`}
                  >
                    Try another photo
                  </button>
                </>
              )}
            </div>
            <button
              type="button"
              aria-label={`Remove ${attachment.name}`}
              onClick={onRemoveAttachment}
              className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl text-text-muted transition-colors duration-200 ease-[cubic-bezier(0.2,0,0,1)] hover:bg-surface-2 hover:text-text ${focusRing}`}
            >
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        )}

        {offlineNotice && (
          <p className="px-4 pt-2 text-xs text-warning">{OFFLINE_COPY}</p>
        )}

        <div className={`flex items-end gap-2 py-1.5 pr-3 ${onPickPhoto ? "pl-1.5" : "pl-4"}`}>
          {onPickPhoto && (
            <PhotoPicker
              ref={pickerRef}
              disabled={disabled}
              onBeforeOpen={() => onBeforePickerOpen?.()}
              onOffline={() => setOfflineNotice(true)}
              onFile={(file) => {
                setOfflineNotice(false);
                onPickPhoto(file);
              }}
            />
          )}

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
            placeholder={resolvedPlaceholder}
            rows={1}
            maxLength={1000}
            className={`max-h-[140px] min-h-[24px] min-w-0 flex-1 self-center resize-none overflow-y-auto bg-transparent py-1 text-base leading-relaxed text-text outline-none placeholder:text-text-dim ${
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
      </div>
    );
  },
);

export default ChatComposer;
