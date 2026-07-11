"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import AppShell from "@/components/app/AppShell";

export interface AccountData {
  tier: "snapshot" | "portrait" | "studio";
  monthly_used: number;
  monthly_limit: number;
  credits_remaining: number;
  total_purchased: number;
  subscription_status: "active" | "cancelled" | "past_due" | null;
  subscription_end_date: string | null;
}

export interface SessionRow {
  session_id: string;
  title: string | null;
  updated_at: string;
}

export default function AppPage() {
  const router = useRouter();
  const [account, setAccount] = useState<AccountData | null>(null);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [userEmail, setUserEmail] = useState("");
  const [accountError, setAccountError] = useState(false);
  const [sessionsError, setSessionsError] = useState(false);

  // Shared across the mount effect and any later standalone refetchSessions()
  // call — component lifetime, not effect lifetime, so every 401 path (mount
  // or post-mount) redirects at most once.
  const redirectedRef = useRef(false);
  function redirectOnAuthLoss() {
    if (!redirectedRef.current) { redirectedRef.current = true; router.push("/auth/signin"); }
  }

  // Standalone re-fetch, callable after the initial mount effect (e.g. when
  // a turn completes and the sidebar list may be stale).
  function refetchSessions() {
    return fetch("/api/sessions")
      .then((r) => {
        if (r.status === 401) { redirectOnAuthLoss(); return; }
        if (!r.ok) { setSessionsError(true); return; }
        return r.json() as Promise<{ sessions: SessionRow[]; has_more: boolean }>;
      })
      .then((data) => {
        if (data) {
          setSessions(data.sessions ?? []);
          setHasMore(data.has_more);
        }
      })
      .catch(() => setSessionsError(true));
  }

  useEffect(() => {
    const supabase = createClient();

    // Redirect to sign-in when the session is revoked (global sign-out, token expiry).
    // SIGNED_OUT is the only event that triggers a redirect — INITIAL_SESSION and
    // TOKEN_REFRESHED fire during normal operation and must not bounce the user.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        router.push("/auth/signin");
      }
    });

    const fetchAccount = fetch("/api/account")
      .then((r) => {
        if (r.status === 401) { redirectOnAuthLoss(); return; }
        if (!r.ok) { setAccountError(true); return; }
        return r.json() as Promise<AccountData>;
      })
      .then((data) => { if (data) setAccount(data); })
      .catch(() => setAccountError(true));

    const fetchSessions = refetchSessions();

    // getSession() reads the local cookie — no network round trip.
    // Email is only used for avatar initials so session-level trust is fine.
    const fetchEmail = supabase.auth
      .getSession()
      .then(({ data: { session } }) => setUserEmail(session?.user?.email ?? ""))
      .catch(() => {});

    Promise.all([fetchAccount, fetchSessions, fetchEmail]).finally(() =>
      setLoading(false)
    );

    return () => subscription.unsubscribe();
  }, [router]);

  return (
    <AppShell
      account={account}
      sessions={sessions}
      hasMore={hasMore}
      loading={loading}
      userEmail={userEmail}
      accountError={accountError}
      sessionsError={sessionsError}
      onSessionActivity={refetchSessions}
      onUsageUpdate={({ monthly_count, credits_remaining }) =>
        setAccount((prev) => {
          if (!prev) return prev;
          return { ...prev, monthly_used: monthly_count, credits_remaining };
        })
      }
    />
  );
}
