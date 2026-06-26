"use client";

import Sidebar from "@/components/app/Sidebar";
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
  return (
    <div
      className="grid h-screen overflow-hidden"
      style={{ gridTemplateColumns: "260px 1fr" }}
    >
      <aside className="h-screen overflow-hidden border-r border-border">
        <Sidebar
          account={account}
          sessions={sessions}
          hasMore={hasMore}
          loading={loading}
          userEmail={userEmail}
          accountError={accountError}
          sessionsError={sessionsError}
          activeSessionId={null}
        />
      </aside>

      <main className="overflow-y-auto bg-bg">
        <div className="mx-auto flex h-full max-w-[880px] items-center justify-center">
          <p className="select-none text-text-muted">Your scene will appear here</p>
        </div>
      </main>
    </div>
  );
}
