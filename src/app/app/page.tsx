"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import AppShell from "@/components/app/AppShell";

export interface AccountData {
  tier: "snapshot" | "portrait" | "studio";
  monthly_used: number;
  monthly_limit: number;
  credits_remaining: number;
  total_purchased: number;
}

export interface SessionRow {
  session_id: string;
  title: string | null;
  updated_at: string;
}

export default function AppPage() {
  const [account, setAccount] = useState<AccountData | null>(null);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [userEmail, setUserEmail] = useState("");
  const [accountError, setAccountError] = useState(false);
  const [sessionsError, setSessionsError] = useState(false);

  useEffect(() => {
    const supabase = createClient();

    const fetchAccount = fetch("/api/account")
      .then((r) => r.json())
      .then((data: AccountData) => setAccount(data))
      .catch(() => setAccountError(true));

    const fetchSessions = fetch("/api/sessions")
      .then((r) => r.json())
      .then((data: { sessions: SessionRow[]; has_more: boolean }) => {
        setSessions(data.sessions);
        setHasMore(data.has_more);
      })
      .catch(() => setSessionsError(true));

    // getSession() reads the local cookie — no network round trip.
    // Email is only used for avatar initials so session-level trust is fine.
    const fetchEmail = supabase.auth
      .getSession()
      .then(({ data: { session } }) => setUserEmail(session?.user?.email ?? ""))
      .catch(() => {});

    Promise.all([fetchAccount, fetchSessions, fetchEmail]).finally(() =>
      setLoading(false)
    );
  }, []);

  return (
    <AppShell
      account={account}
      sessions={sessions}
      hasMore={hasMore}
      loading={loading}
      userEmail={userEmail}
      accountError={accountError}
      sessionsError={sessionsError}
    />
  );
}
