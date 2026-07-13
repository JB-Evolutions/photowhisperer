"use client";

import { useState, useRef, useEffect } from "react";
import { ToastProvider } from "@/components/app/useToast";
import Sidebar from "@/components/app/Sidebar";
import MobileTopBar from "@/components/app/MobileTopBar";
import MobileDrawer from "@/components/app/MobileDrawer";
import EmptyState from "@/components/app/EmptyState";
import ChatComposer from "@/components/app/ChatComposer";
import SessionView from "@/components/app/SessionView";
import OutOfCreditsCard from "@/components/app/OutOfCreditsCard";
import SoftWarningBanner from "@/components/app/SoftWarningBanner";
import RateLimitBanner from "@/components/app/RateLimitBanner";
import SubscriptionBanner from "@/components/app/SubscriptionBanner";
import InstallBanner from "@/components/app/InstallBanner";
import { useInstallPrompt } from "@/hooks/useInstallPrompt";
import { SOFT_WARNING_THRESHOLD, RATE_LIMIT_COOLDOWN_SECONDS } from "@/lib/quota";
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
  onSessionActivity?: () => void;
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
  onSessionActivity,
}: AppShellProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [composerValue, setComposerValue] = useState("");
  const [hasThread, setHasThread] = useState(false);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  const composerRef = useRef<ChatComposerHandle>(null);
  const sessionViewRef = useRef<SessionViewHandle>(null);

  const install = useInstallPrompt();

  // Forces the §4.10 card on for a quota_exceeded response that arrived
  // without monthly_count/credits_remaining (so the real numeric condition
  // below can't be computed) — OR'd into it, never replacing it.
  //
  // Single clear path: onRequestSucceeded (a genuine status:"ok" response) —
  // the unambiguous "they're not locked out anymore" signal. No reactive
  // effect on account's numbers here — that raced the set (a stale-but-
  // passing account value already in place when the no-numbers case fires
  // could clear the flag before render). The purchase/upgrade-refresh path
  // doesn't need a separate clear: /billing/success is a distinct top-level
  // route from /app (both "use client" page.tsx files, not nested under a
  // shared layout), so returning to /app fully remounts AppShell, resetting
  // this state to its initial `false` for free.
  const [forceOutOfCredits, setForceOutOfCredits] = useState(false);

  const outOfCredits =
    forceOutOfCredits ||
    (account != null &&
      account.monthly_used >= account.monthly_limit &&
      account.credits_remaining <= 0);

  const softWarning =
    account != null &&
    account.monthly_used >= SOFT_WARNING_THRESHOLD * account.monthly_limit &&
    !outOfCredits;

  const [cooldown, setCooldown] = useState(0);
  const rateLimited = cooldown > 0;

  useEffect(() => {
    if (!rateLimited) return;
    const id = setInterval(() => {
      setCooldown((c) => (c <= 1 ? 0 : c - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [rateLimited]); // fires only on active↔idle transition, not every tick

  useEffect(() => {
    if (!composerValue.startsWith("Same scene but ")) {
      sessionViewRef.current?.clearPendingRefinement();
    }
  }, [composerValue]);

  function handleNewScene() {
    sessionViewRef.current?.reset();
    setComposerValue("");
    setDrawerOpen(false);
  }

  function handleSessionSelect(id: string) {
    sessionViewRef.current?.loadSession(id);
    setDrawerOpen(false);
  }

  const sidebarProps = {
    account,
    sessions,
    hasMore,
    loading,
    userEmail,
    accountError,
    sessionsError,
    activeSessionId,
    onNewScene: handleNewScene,
    onSessionSelect: handleSessionSelect,
    installSidebarVisible: install.sidebarVisible,
    onInstallClick: install.triggerInstall,
  };

  return (
    <ToastProvider>
      <div
        className="flex h-screen flex-col overflow-hidden md:grid md:grid-cols-[260px_1fr]"
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

              <div className="flex-shrink-0 pt-4">
                <InstallBanner
                  visible={install.bannerVisible}
                  platform={install.platform}
                  onInstall={() => void install.triggerInstall()}
                  onDismissSession={install.dismissSession}
                  onDismissForever={install.dismissForever}
                />
                {account && (
                  <SubscriptionBanner
                    tier={account.tier}
                    subscription_status={account.subscription_status}
                    subscription_end_date={account.subscription_end_date}
                  />
                )}
              </div>

              {/* Thread — always mounted so sessionViewRef is live for the first send.
                  Tailwind `hidden` (display:none) until onThreadEmptyChange fires. */}
              <div className={hasThread ? "flex-1 overflow-y-auto px-4 py-6" : "hidden"}>
                <SessionView
                  ref={sessionViewRef}
                  onRequestFocus={() => composerRef.current?.focus()}
                  onThreadEmptyChange={(isEmpty) => setHasThread(!isEmpty)}
                  onSessionIdChange={setActiveSessionId}
                  onUsageUpdate={onUsageUpdate}
                  onRateLimit={() => setCooldown(RATE_LIMIT_COOLDOWN_SECONDS)}
                  onQuotaExceeded={() => setForceOutOfCredits(true)}
                  onRequestSucceeded={() => {
                    setForceOutOfCredits(false);
                    onSessionActivity?.();
                    install.markSceneCompleted();
                  }}
                  onPreFillComposer={(text) => {
                    setComposerValue(text);
                    composerRef.current?.focus();
                  }}
                />
              </div>

              {/* Empty state — centered, conditionally rendered (not just hidden) */}
              {!hasThread && (
                <div className="flex flex-1 items-center justify-center">
                  <EmptyState
                    onChipSelect={setComposerValue}
                    disabled={outOfCredits}
                  />
                </div>
              )}

              {softWarning && account && (
                <SoftWarningBanner
                  monthlyUsed={account.monthly_used}
                  monthlyLimit={account.monthly_limit}
                />
              )}

              {rateLimited && !outOfCredits && (
                <RateLimitBanner cooldown={cooldown} />
              )}

              {/* Composer — always pinned at bottom */}
              <div className="flex-shrink-0 border-t border-border p-4">
                {outOfCredits && account ? (
                  <OutOfCreditsCard
                    tier={account.tier}
                    monthlyLimit={account.monthly_limit}
                  />
                ) : (
                  <ChatComposer
                    ref={composerRef}
                    value={composerValue}
                    onChange={setComposerValue}
                    onSend={(text) => {
                      sessionViewRef.current?.send(text);
                      setComposerValue("");
                    }}
                    disabled={outOfCredits || rateLimited}
                  />
                )}
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
