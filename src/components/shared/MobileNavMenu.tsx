"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Button from "./Button";
import ThemeToggle from "./ThemeToggle";
import { TIER_DISPLAY_NAMES, type Tier } from "@/lib/quota";
interface NavLink { label: string; href: string; }
interface MobileNavMenuProps { links: NavLink[]; isLoggedIn: boolean; tier: Tier | null; }
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function MobileNavMenu({ links, isLoggedIn, tier }: MobileNavMenuProps) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const handleClose = useCallback(() => { setOpen(false); triggerRef.current?.focus(); }, []);
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") { handleClose(); return; }
      if (e.key !== "Tab" || !panelRef.current) return;
      const focusable = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus(); }
      } else if (document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, handleClose]);
  useEffect(() => {
    if (!open || !panelRef.current) return;
    panelRef.current.querySelector<HTMLElement>(FOCUSABLE)?.focus();
  }, [open]);
  useEffect(() => {
    const mql = window.matchMedia("(min-width: 768px)");
    const onChange = (e: MediaQueryListEvent) => { if (e.matches) setOpen(false); };
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-controls="mobile-nav-menu"
        aria-label={open ? "Close menu" : "Open menu"}
        className="md:hidden flex h-9 w-9 items-center justify-center rounded-[10px] text-text-muted transition-colors hover:text-text"
        onClick={() => setOpen((v) => !v)}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
          {open ? <path d="M18 6L6 18M6 6l12 12" /> : <path d="M3 6h18M3 12h18M3 18h18" />}
        </svg>
      </button>
      <div
        id="mobile-nav-menu"
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        aria-hidden={open ? undefined : "true"}
        className={`fixed inset-0 z-50 md:hidden flex flex-col bg-surface transition-opacity duration-[280ms] ease-out motion-reduce:transition-none ${
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
        onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
      >
        <div ref={panelRef} tabIndex={-1} inert={open ? undefined : true} className="flex h-full flex-col p-6">
          <div className="flex items-center justify-between">
            <ThemeToggle />
            <button
              type="button"
              onClick={handleClose}
              aria-label="Close menu"
              className="flex h-8 w-8 items-center justify-center rounded text-text-muted transition-colors hover:text-text"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
          <ul className="flex flex-col items-center justify-start gap-8 list-none">
            {links.map((link) => (
              <li key={link.href}>
                <Link href={link.href} onClick={handleClose} className="text-lg text-text">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
          <div className="flex flex-col gap-2.5 pb-8 mt-auto">
            {isLoggedIn ? (
              <>
                <span className="text-center font-mono text-xs uppercase tracking-[0.08em] text-text-dim">
                  {TIER_DISPLAY_NAMES[tier ?? "snapshot"]}
                </span>
                <Button href="/app" variant="outline" fullWidth onClick={handleClose}>Open app</Button>
                <Button href="/app" variant="primary" fullWidth onClick={handleClose}>New scene</Button>
              </>
            ) : (
              <>
                <Button href="/auth/signin" variant="ghost" fullWidth onClick={handleClose}>Sign in</Button>
                <Button href="/auth/signup" variant="primary" fullWidth onClick={handleClose}>Get my settings</Button>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
