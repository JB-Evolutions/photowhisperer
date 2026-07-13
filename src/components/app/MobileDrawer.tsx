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
  onNewScene: () => void;
  onSessionSelect: (id: string) => void;
  installSidebarVisible: boolean;
  onInstallClick: () => void;
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
  onNewScene,
  onSessionSelect,
  installSidebarVisible,
  onInstallClick,
}: MobileDrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  // Captures the element that triggered open so focus returns to it on close.
  const returnFocusRef = useRef<Element | null>(null);
  // Mutable gesture state — never causes re-renders, purely imperative.
  const gestureRef = useRef({ startX: 0, startY: 0, lastX: 0, lastTime: 0, intent: null as "horizontal" | "vertical" | null, active: false });

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
  // Also clears any inline styles left by a previous swipe gesture.
  useEffect(() => {
    if (open) {
      if (panelRef.current) {
        panelRef.current.style.transform = "";
        panelRef.current.style.transition = "";
      }
      returnFocusRef.current = document.activeElement;
      panelRef.current?.focus();
    } else {
      const el = returnFocusRef.current;
      if (el instanceof HTMLElement) el.focus();
      returnFocusRef.current = null;
    }
  }, [open]);

  useEffect(() => {
    const rawPanel = panelRef.current;
    if (!rawPanel || !open) return;
    const panel: HTMLDivElement = rawPanel;

    const g = gestureRef.current;

    function onTouchStart(e: TouchEvent) {
      const t = e.touches[0];
      g.startX = t.clientX;
      g.startY = t.clientY;
      g.lastX = t.clientX;
      g.lastTime = Date.now();
      g.intent = null;
      g.active = false;
    }

    function onTouchMove(e: TouchEvent) {
      const t = e.touches[0];
      const deltaX = t.clientX - g.startX;
      const deltaY = t.clientY - g.startY;

      if (g.intent === null && (Math.abs(deltaX) > 5 || Math.abs(deltaY) > 5)) {
        g.intent = Math.abs(deltaY) > Math.abs(deltaX) ? "vertical" : "horizontal";
      }
      if (g.intent !== "horizontal") return;
      if (deltaX >= 0) return;

      e.preventDefault();
      g.active = true;
      g.lastX = t.clientX;
      g.lastTime = Date.now();

      panel.style.transition = "none";
      panel.style.transform = `translateX(${Math.max(deltaX, -panel.offsetWidth)}px)`;
    }

    function settle(close: boolean) {
      g.active = false;
      panel.style.transition = "transform 280ms ease-out";
      if (close) {
        panel.style.transform = "translateX(-100%)";
        onClose();
      } else {
        panel.style.transform = "translateX(0)";
        function onTransitionEnd(ev: TransitionEvent) {
          if (ev.propertyName !== "transform") return;
          panel.removeEventListener("transitionend", onTransitionEnd);
          panel.style.transform = "";
          panel.style.transition = "";
        }
        panel.addEventListener("transitionend", onTransitionEnd);
      }
    }

    function onTouchEnd(e: TouchEvent) {
      if (!g.active) return;
      const t = e.changedTouches[0];
      const deltaX = t.clientX - g.startX;
      const elapsed = Date.now() - g.lastTime;
      const velocity = elapsed > 0 ? (t.clientX - g.lastX) / elapsed : 0;
      settle(Math.abs(deltaX) / panel.offsetWidth > 0.4 || velocity < -0.3);
    }

    function onTouchCancel() {
      if (g.active) settle(false);
    }

    panel.addEventListener("touchstart", onTouchStart);
    panel.addEventListener("touchmove", onTouchMove, { passive: false });
    panel.addEventListener("touchend", onTouchEnd);
    panel.addEventListener("touchcancel", onTouchCancel);
    return () => {
      panel.removeEventListener("touchstart", onTouchStart);
      panel.removeEventListener("touchmove", onTouchMove);
      panel.removeEventListener("touchend", onTouchEnd);
      panel.removeEventListener("touchcancel", onTouchCancel);
    };
  }, [open, onClose]);

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
          onNewScene={onNewScene}
          onSessionSelect={onSessionSelect}
          installSidebarVisible={installSidebarVisible}
          onInstallClick={onInstallClick}
        />
      </div>
    </div>
  );
}
