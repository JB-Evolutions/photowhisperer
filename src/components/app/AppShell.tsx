"use client";

import { useState, useRef } from "react";
import { ToastProvider } from "@/components/app/useToast";
import Sidebar from "@/components/app/Sidebar";
import MobileTopBar from "@/components/app/MobileTopBar";
import MobileDrawer from "@/components/app/MobileDrawer";
import EmptyState from "@/components/app/EmptyState";
import ChatComposer from "@/components/app/ChatComposer";
import SessionView from "@/components/app/SessionView";
import Button from "@/components/shared/Button";
import type { ChatComposerHandle } from "@/components/app/ChatComposer";
import type { SessionViewHandle } from "@/components/app/SessionView";
import type { AccountData, SessionRow } from "@/app/app/page";

interface AppShellProps {
  account: AccountData | null;
  sessions: SessionRow[];
  hasMore: boolean;
  loading: boolean;
  userEmail: string;
  accountError: boolean;
  sessionsError: boolean;
  onUsageUpdate?: (update: { monthly_count: number; credits_remaining: number }) => void;
}

export default function AppShell({
  account,
  sessions,
  hasMore,
  loading,
  userEmail,
  accountError,
  sessionsError,
  onUsageUpdate,
}: AppShellProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [composerValue, setComposerValue] = useState("");
  const [hasThread, setHasThread] = useState(false);

  const composerRef = useRef<ChatComposerHandle>(null);
  const sessionViewRef = useRef<SessionViewHandle>(null);

  const outOfCredits =
    account != null &&
    account.monthly_used >= account.monthly_limit &&
    account.credits_remaining <= 0;

  const outOfCreditsNotice = outOfCredits ? (
    <div className="flex flex-col items-center gap-3 text-center">
      {/* TODO(9.7): paid-tier out-of-credits copy */}
      <p className="text-sm text-text-muted">You&apos;ve used your 5 free settings.</p>
      <div className="flex gap-2">
        <Button variant="outline" onClick={() => { /* TODO(9.10): billing modal */ }}>
          Buy credits
        </Button>
        <Button variant="outline" onClick={() => { /* TODO(9.10): billing modal */ }}>
          Upgrade
        </Button>
      </div>
    </div>
  ) : undefined;

  const sidebarProps = {
    account,
    sessions,
    hasMore,
    loading,
    userEmail,
    accountError,
    sessionsError,
    activeSessionId: null as string | null,
  };

  return (
    <ToastProvider>
      <div
        className="flex h-screen flex-col overflow-hidden md:grid"
        style={{ gridTemplateColumns: "260px 1fr" }}
      >
        {/* Desktop sidebar — hidden on mobile */}
        <aside className="hidden h-screen overflow-hidden border-r border-border md:block">
          <Sidebar {...sidebarProps} />
        </aside>

        {/* Main column */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <MobileTopBar onMenuClick={() => setDrawerOpen(true)} />

          {/* overflow-hidden so the thread div controls its own scroll */}
          <main className="flex min-h-0 flex-1 flex-col overflow-hidden bg-bg">
            <div className="mx-auto flex min-h-0 w-full max-w-[880px] flex-1 flex-col">

              {/* Thread — always mounted so sessionViewRef is live for the first send.
                  Tailwind `hidden` (display:none) until onThreadEmptyChange fires. */}
              <div className={hasThread ? "flex-1 overflow-y-auto px-4 py-6" : "hidden"}>
                <SessionView
                  ref={sessionViewRef}
                  onRequestFocus={() => composerRef.current?.focus()}
                  onThreadEmptyChange={(isEmpty) => setHasThread(!isEmpty)}
                  onUsageUpdate={onUsageUpdate}
                />
              </div>

              {/* Empty state — centered, conditionally rendered (not just hidden) */}
              {!hasThread && (
                <div className="flex flex-1 items-center justify-center">
                  <EmptyState
                    onChipSelect={setComposerValue}
                    disabled={outOfCredits}
                    outOfCreditsNotice={outOfCreditsNotice}
                  />
                </div>
              )}

              {/* Composer — always pinned at bottom */}
              <div className="flex-shrink-0 border-t border-border p-4">
                <ChatComposer
                  ref={composerRef}
                  value={composerValue}
                  onChange={setComposerValue}
                  onSend={(text) => {
                    sessionViewRef.current?.send(text);
                    setComposerValue("");
                  }}
                  disabled={outOfCredits}
                />
              </div>

            </div>
          </main>
        </div>

        {/* Mobile drawer — always mounted so slide-out animates */}
        <MobileDrawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          {...sidebarProps}
        />
      </div>
    </ToastProvider>
  );
}
