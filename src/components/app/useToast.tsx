"use client";

import { useState, useCallback, useRef, useEffect, createContext, useContext } from "react";
import type { ReactNode } from "react";
import { useVisualViewport } from "@/hooks/useVisualViewport";

export async function copyToClipboard(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // secure-context failure — fall through to execCommand
    }
  }
  const el = document.createElement("textarea");
  el.value = text;
  el.setAttribute("readonly", "");
  el.style.cssText = "position:absolute;left:-9999px;top:0";
  document.body.appendChild(el);
  try {
    el.select();
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    document.body.removeChild(el);
  }
}

export function useToast(): {
  showToast: (msg: string) => void;
  ToastPortal: ReactNode;
} {
  const [message, setMessage] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Fixed-bottom, so the layout viewport is its containing block and the
  // keyboard covers it. bottomInset is 0 without visualViewport, which leaves
  // the safe-area offset on its own exactly as before.
  const { bottomInset } = useVisualViewport();

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const showToast = useCallback((msg: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setMessage(msg);
    timerRef.current = setTimeout(() => setMessage(null), 1800);
  }, []);

  const ToastPortal: ReactNode = message ? (
    <div
      role="status"
      aria-live="polite"
      style={{ bottom: `calc(${bottomInset}px + max(2rem, env(safe-area-inset-bottom)))` }}
      className="pw-toast fixed left-1/2 -translate-x-1/2 z-[100] rounded-xl border border-border-strong bg-surface-3 px-4 py-2 text-sm text-text shadow-lg"
    >
      {message}
    </div>
  ) : null;

  return { showToast, ToastPortal };
}

const ToastContext = createContext<((msg: string) => void) | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const { showToast, ToastPortal } = useToast();
  return (
    <ToastContext.Provider value={showToast}>
      {children}
      {ToastPortal}
    </ToastContext.Provider>
  );
}

export function useToastContext(): (msg: string) => void {
  const fn = useContext(ToastContext);
  if (!fn) throw new Error("useToastContext called outside <ToastProvider>");
  return fn;
}
