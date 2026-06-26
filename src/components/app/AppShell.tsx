"use client";

import { useState } from "react";
import Sidebar from "@/components/app/Sidebar";
import MobileTopBar from "@/components/app/MobileTopBar";
import MobileDrawer from "@/components/app/MobileDrawer";
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
          <div className="mx-auto flex h-full max-w-[880px] items-center justify-center">
            <p className="select-none text-text-muted">Your scene will appear here</p>
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
