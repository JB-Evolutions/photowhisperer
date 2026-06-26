"use client";

import { useEffect, useRef } from "react";
import Sidebar from "@/components/app/Sidebar";
import type { AccountData, SessionRow } from "@/app/app/page";

interface MobileDrawerProps {
  open: boolean;
  onClose: () => void;
  account: AccountData | null;
  sessions: SessionRow[];
  hasMore: boolean;
  loading: boolean;
  userEmail: string;
  accountError: boolean;
  sessionsError: boolean;
  activeSessionId: string | null;
}

export default function MobileDrawer({
  open,
  onClose,
  account,
  sessions,
  hasMore,
  loading,
  userEmail,
  accountError,
  sessionsError,
  activeSessionId,
}: MobileDrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  // Captures the element that triggered open so focus returns to it on close.
  const returnFocusRef = useRef<Element | null>(null);

  // Lock body scroll while drawer is open.
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  // Escape key dismisses + Tab focus trap — one listener, always cleaned up.
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") { onClose(); return; }
      if (e.key !== "Tab" || !panelRef.current) return;
      const focusable = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus(); }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  // Capture opener, move focus in on open; return focus to opener on close.
  useEffect(() => {
    if (open) {
      returnFocusRef.current = document.activeElement;
      panelRef.current?.focus();
    } else {
      const el = returnFocusRef.current;
      if (el instanceof HTMLElement) el.focus();
      returnFocusRef.current = null;
    }
  }, [open]);

  return (
    // Always mounted — visibility controlled via transform/opacity so slide-out animates.
    <div
      aria-hidden={open ? undefined : "true"}
      className={`fixed inset-0 z-50 md:hidden ${open ? "pointer-events-auto" : "pointer-events-none"}`}
    >
      {/* Backdrop — fades in/out */}
      <div
        aria-hidden="true"
        className={`absolute inset-0 bg-black/50 transition-opacity duration-[280ms] ease-out ${
          open ? "opacity-100" : "opacity-0"
        }`}
        onClick={onClose}
      />

      {/* Drawer panel — slides in from left */}
      {/* TODO(9.4 swipe): attach swipe-to-dismiss gesture handler here */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation"
        tabIndex={-1}
        className={`absolute left-0 top-0 h-full w-[280px] max-w-[85vw] overflow-hidden transition-transform duration-[280ms] ease-out motion-reduce:transition-none ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <Sidebar
          account={account}
          sessions={sessions}
          hasMore={hasMore}
          loading={loading}
          userEmail={userEmail}
          accountError={accountError}
          sessionsError={sessionsError}
          activeSessionId={activeSessionId}
        />
      </div>
    </div>
  );
}
