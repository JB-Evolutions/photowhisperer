"use client";

import { useState } from "react";
import Sidebar from "@/components/app/Sidebar";
import MobileTopBar from "@/components/app/MobileTopBar";
import MobileDrawer from "@/components/app/MobileDrawer";
import EmptyState from "@/components/app/EmptyState";
import ChatComposer from "@/components/app/ChatComposer";
import Button from "@/components/shared/Button";
import type { AccountData, SessionRow } from "@/app/app/page";

interface AppShellProps {
  account: AccountData | null;
  sessions: SessionRow[];
  hasMore: boolean;
  loading: boolean;
  userEmail: string;
  accountError: boolean;
  sessionsError: boolean;
}

export default function AppShell({
  account,
  sessions,
  hasMore,
  loading,
  userEmail,
  accountError,
  sessionsError,
}: AppShellProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [composerValue, setComposerValue] = useState("");

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
    <div
      className="flex h-screen flex-col overflow-hidden md:grid"
      style={{ gridTemplateColumns: "260px 1fr" }}
    >
      {/* Desktop sidebar — hidden on mobile */}
      <aside className="hidden h-screen overflow-hidden border-r border-border md:block">
        <Sidebar {...sidebarProps} />
      </aside>

      {/* Main column — flex-col stack on mobile, grid cell on desktop */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <MobileTopBar onMenuClick={() => setDrawerOpen(true)} />
        <main className="flex-1 overflow-y-auto bg-bg">
          <div className="mx-auto flex min-h-full max-w-[880px] flex-col">
            <div className="flex flex-1 items-center justify-center">
              <EmptyState
                onChipSelect={setComposerValue}
                disabled={outOfCredits}
                outOfCreditsNotice={outOfCreditsNotice}
              />
            </div>
            <div className="flex-shrink-0 border-t border-border p-4">
              <ChatComposer
                value={composerValue}
                onChange={setComposerValue}
                onSend={() => { setComposerValue(""); /* TODO: wire /api/settings in 9.6 */ }}
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
  );
}
