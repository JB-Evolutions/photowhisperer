"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { ToastProvider } from "@/components/app/useToast";
import Button from "@/components/shared/Button";

export type TabId = "profile" | "camera" | "preferences" | "security";

const TABS: { id: TabId; label: string }[] = [
  { id: "profile",     label: "Profile"     },
  { id: "camera",      label: "Camera"      },
  { id: "preferences", label: "Preferences" },
  { id: "security",    label: "Security"    },
];

export interface TabActions {
  save: () => Promise<void>;
  discard: () => void;
}

// ─── SaveBar ────────────────────────────────────────────────────────────────

function SaveBar({
  onSave,
  onDiscard,
  pending,
}: {
  onSave: () => void;
  onDiscard: () => void;
  pending: boolean;
}) {
  return (
    <div className="sticky bottom-0 z-10 flex items-center justify-between gap-4 border-t border-border bg-bg px-6 py-4">
      <p className="text-sm text-text-muted">You have unsaved changes</p>
      <div className="flex items-center gap-3">
        <Button variant="outline" onClick={onDiscard} disabled={pending}>
          Discard
        </Button>
        <Button variant="primary" onClick={onSave} pending={pending} pendingLabel="Saving…">
          Save changes
        </Button>
      </div>
    </div>
  );
}

// ─── DirtyGuard ─────────────────────────────────────────────────────────────

function DirtyGuard({
  pendingTabLabel,
  onSave,
  onDiscard,
  onCancel,
  pending,
}: {
  pendingTabLabel: string;
  onSave: () => void;
  onDiscard: () => void;
  onCancel: () => void;
  pending: boolean;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);

  // Move focus into the dialog on mount.
  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  // Escape dismisses (when not mid-save); Tab/Shift+Tab trapped within dialog.
  // Mirrors the pattern in MobileDrawer.tsx.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (!pending) onCancel();
        return;
      }
      if (e.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
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
  }, [onCancel, pending]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="dirty-guard-heading"
        tabIndex={-1}
        className="w-full max-w-sm rounded-[16px] border border-border bg-surface p-6 shadow-xl outline-none"
      >
        <h2 id="dirty-guard-heading" className="font-display text-lg text-text">
          Unsaved changes
        </h2>
        <p className="mt-2 text-sm text-text-muted">
          Save your changes before switching to {pendingTabLabel}, or discard them.
        </p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={onCancel} disabled={pending}>
            Cancel
          </Button>
          <Button variant="outline" onClick={onDiscard} disabled={pending}>
            Discard
          </Button>
          <Button variant="primary" onClick={onSave} pending={pending} pendingLabel="Saving…">
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── AccountSettings ────────────────────────────────────────────────────────

export default function AccountSettings({ email }: { email: string }) {
  const [activeTab, setActiveTab] = useState<TabId>("profile");
  const [savePending, setSavePending] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [pendingTab, setPendingTab] = useState<TabId | null>(null);

  const actionsRef = useRef<TabActions | null>(null);
  const railRef = useRef<HTMLDivElement>(null);

  // Called by each tab to register its save/discard implementation.
  function registerActions(actions: TabActions | null) {
    actionsRef.current = actions;
  }

  async function handleSave() {
    if (!actionsRef.current || savePending) return;
    setSavePending(true);
    try {
      await actionsRef.current.save();
      // Tab calls onDirtyChange(false) on successful save.
    } finally {
      setSavePending(false);
    }
  }

  function handleDiscard() {
    actionsRef.current?.discard();
    // Tab calls onDirtyChange(false) in its discard() impl.
  }

  function selectTab(id: TabId) {
    if (id === activeTab) return;
    if (isDirty) {
      setPendingTab(id);
      return;
    }
    commitTabSwitch(id);
  }

  function commitTabSwitch(id: TabId) {
    actionsRef.current = null;
    setIsDirty(false);
    setActiveTab(id);
  }

  async function dirtyGuardSave() {
    if (!actionsRef.current || savePending) return;
    setSavePending(true);
    try {
      await actionsRef.current.save();
      const target = pendingTab;
      setPendingTab(null);
      if (target) commitTabSwitch(target);
    } catch {
      // save() surfaces its own errors; stay on current tab.
    } finally {
      setSavePending(false);
    }
  }

  function dirtyGuardDiscard() {
    actionsRef.current?.discard();
    const target = pendingTab;
    setIsDirty(false);
    setPendingTab(null);
    if (target) commitTabSwitch(target);
  }

  function handleRailKeyDown(e: React.KeyboardEvent) {
    if (!railRef.current) return;
    const items = Array.from(
      railRef.current.querySelectorAll<HTMLButtonElement>('[role="tab"]')
    );
    const idx = items.findIndex((el) => el === document.activeElement);
    if (idx === -1) return;
    if (e.key === "ArrowDown" || e.key === "ArrowRight") {
      e.preventDefault();
      items[(idx + 1) % items.length]?.focus();
    } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
      e.preventDefault();
      items[(idx - 1 + items.length) % items.length]?.focus();
    } else if (e.key === "Home") {
      e.preventDefault();
      items[0]?.focus();
    } else if (e.key === "End") {
      e.preventDefault();
      items[items.length - 1]?.focus();
    }
  }

  const pendingTabLabel = TABS.find((t) => t.id === pendingTab)?.label ?? "";

  return (
    <ToastProvider>
      {pendingTab !== null && (
        <DirtyGuard
          pendingTabLabel={pendingTabLabel}
          onSave={dirtyGuardSave}
          onDiscard={dirtyGuardDiscard}
          onCancel={() => setPendingTab(null)}
          pending={savePending}
        />
      )}

      <div className="flex min-h-screen flex-col bg-bg">
        {/* Header */}
        <header className="flex items-center gap-4 border-b border-border px-6 py-5">
          <Link
            href="/app"
            aria-label="Back to app"
            className="inline-flex items-center gap-1.5 rounded text-sm text-text-muted transition-colors duration-[250ms] hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-accent)]"
          >
            <svg
              width="16" height="16" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2"
              strokeLinecap="round" strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M19 12H5M12 5l-7 7 7 7" />
            </svg>
            Back to app
          </Link>
          <h1 className="font-display text-xl text-text">Account</h1>
        </header>

        {/* Two-pane body */}
        <div className="flex flex-1 flex-col md:flex-row md:overflow-hidden">

          {/* Left rail — horizontal scroll on mobile, vertical on desktop */}
          <nav
            aria-label="Account sections"
            className="md:w-[220px] md:flex-shrink-0 md:border-r md:border-border"
          >
            <div
              ref={railRef}
              role="tablist"
              onKeyDown={handleRailKeyDown}
              className="flex gap-1 overflow-x-auto px-4 py-3 md:flex-col md:overflow-x-visible md:p-4"
            >
              {TABS.map((tab) => {
                const active = tab.id === activeTab;
                return (
                  <button
                    key={tab.id}
                    role="tab"
                    id={`tab-${tab.id}`}
                    aria-selected={active}
                    aria-controls={`panel-${tab.id}`}
                    tabIndex={active ? 0 : -1}
                    onClick={() => selectTab(tab.id)}
                    className={[
                      "whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition-colors duration-[250ms]",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-accent)]",
                      "md:w-full md:text-left md:py-2.5 md:border-l-2 md:pl-[14px]",
                      active
                        ? "bg-surface-2 text-text font-semibold md:border-accent"
                        : "text-text-muted hover:text-text hover:bg-surface md:border-transparent",
                    ].join(" ")}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </nav>

          {/* Right pane — tab panels */}
          <main className="flex min-h-0 flex-1 flex-col overflow-y-auto">
            {TABS.map((tab) => (
              <section
                key={tab.id}
                role="tabpanel"
                id={`panel-${tab.id}`}
                aria-labelledby={`tab-${tab.id}`}
                hidden={tab.id !== activeTab}
              >
                {tab.id === activeTab && (
                  <>
                    {/* Placeholder — replaced per tab in subsequent commits */}
                    <div className="px-6 py-8">
                      <p className="text-sm text-text-muted">{tab.label} — coming soon</p>
                    </div>
                    {isDirty && (
                      <SaveBar
                        onSave={handleSave}
                        onDiscard={handleDiscard}
                        pending={savePending}
                      />
                    )}
                  </>
                )}
              </section>
            ))}
          </main>

        </div>
      </div>
    </ToastProvider>
  );
}
