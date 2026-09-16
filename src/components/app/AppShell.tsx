"use client";

import { useState, useRef, useEffect } from "react";
import type { BodyProfile, BrightnessIntent, LightCondition } from "@/lib/contract/types";
import { prepareImage } from "@/lib/image/prepare";
import { clearComposerDraft, restoreComposerDraft, saveComposerDraft } from "@/lib/image/composer";
import ConditionSelector from "@/components/app/ConditionSelector";
import BrightnessStepper from "@/components/app/BrightnessStepper";
import { DEFAULT_INTENT } from "@/components/app/conditions";
import { attachmentErrorKind, jpegDataUri, type ComposerAttachment } from "@/components/app/photoAttachment";
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

  // Condition selector: session-scoped, never mandatory.
  const [condition, setCondition] = useState<LightCondition | null>(null);
  const [intent, setIntent] = useState<BrightnessIntent>(DEFAULT_INTENT);
  // Words the shortfall line; unknown until the profile loads (or if it fails).
  const [isoMode, setIsoMode] = useState<BodyProfile["isoMode"] | null>(null);

  // Mirrors SessionView's in-flight flag so the controls above the composer
  // dim while a request runs. SessionView already ignores a send() during
  // flight — this is the visible half of that rule.
  const [isSending, setIsSending] = useState(false);

  const [attachment, setAttachment] = useState<ComposerAttachment | null>(null);
  // Bumped whenever the attachment is replaced, removed or sent, so a late
  // prepareImage result can't resurrect it.
  const attachmentIdRef = useRef(0);

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
    account.credits_remaining <= 0 &&
    !outOfCredits;

  // account == null is the single gate the composer's `sendDisabled` prop
  // uses below, so a settings request — and therefore a quota_exceeded
  // response — can never arrive while account is still null.

  const [cooldown, setCooldown] = useState(0);
  const rateLimited = cooldown > 0;

  useEffect(() => {
    if (!rateLimited) return;
    const id = setInterval(() => {
      setCooldown((c) => (c <= 1 ? 0 : c - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [rateLimited]); // fires only on active↔idle transition, not every tick

  // iOS can relaunch a standalone PWA when the file picker opens: restore
  // the draft saved just before it opened, then drop it.
  // Deferred a tick so the restore runs after hydration, and so a StrictMode
  // double-mount cancels the first attempt before it clears the draft.
  useEffect(() => {
    const id = window.setTimeout(() => {
      const draft = restoreComposerDraft();
      clearComposerDraft();
      if (!draft) return;
      if (draft.text) setComposerValue(draft.text);
      if (draft.session_id) void sessionViewRef.current?.loadSession(draft.session_id);
    }, 0);
    return () => window.clearTimeout(id);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/camera-profile")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { structured?: { isoMode?: BodyProfile["isoMode"] } | null } | null) => {
        if (!cancelled) setIsoMode(data?.structured?.isoMode ?? null);
      })
      .catch(() => {
        // Non-fatal: the shortfall line falls back to "Even at ISO …".
      });
    return () => { cancelled = true; };
  }, []);

  function handleBeforePickerOpen() {
    saveComposerDraft({ text: composerValue, session_id: activeSessionId });
    // The page survived the picker — the draft is no longer needed.
    window.addEventListener("focus", () => clearComposerDraft(), { once: true });
  }

  function handlePickPhoto(file: File) {
    clearComposerDraft();
    const id = ++attachmentIdRef.current;
    const promise = prepareImage(file);
    setAttachment({ id, name: file.name, status: "preparing", thumbnailSrc: null, errorKind: null, promise });
    promise.then(
      (prepared) => {
        if (attachmentIdRef.current !== id) return;
        setAttachment((a) =>
          a && a.id === id ? { ...a, status: "ready", thumbnailSrc: jpegDataUri(prepared.thumbnailBase64) } : a,
        );
      },
      (err: unknown) => {
        if (attachmentIdRef.current !== id) return;
        setAttachment((a) => (a && a.id === id ? { ...a, status: "error", errorKind: attachmentErrorKind(err) } : a));
      },
    );
  }

  function handleRemoveAttachment() {
    attachmentIdRef.current += 1;
    setAttachment(null);
    composerRef.current?.focus();
  }

  function handleSend(text: string) {
    const view = sessionViewRef.current;
    // Keep the text and photo in the composer rather than silently dropping them.
    if (!view || !view.canSend()) return;
    const sendable = attachment && attachment.status !== "error" ? attachment : null;
    view.send(text, { attachment: sendable });
    setComposerValue("");
    attachmentIdRef.current += 1;
    setAttachment(null);
    clearComposerDraft();
  }

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
        className="flex h-dvh flex-col overflow-hidden md:grid md:grid-cols-[260px_1fr]"
      >
        {/* Desktop sidebar — hidden on mobile */}
        <aside className="hidden h-dvh overflow-hidden border-r border-border md:block">
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
                  onPendingChange={setIsSending}
                  condition={condition}
                  intent={intent}
                  isoMode={isoMode}
                  onConditionChosen={setCondition}
                  onTryAnotherPhoto={() => composerRef.current?.openPhotoPicker()}
                />
              </div>

              {/* Empty state — centered, conditionally rendered (not just hidden) */}
              {!hasThread && (
                <div data-shot="app-empty-state" className="flex min-w-0 flex-1 items-center justify-center">
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
              <div data-shot="app-composer" className="flex-shrink-0 border-t border-border p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
                {/* account is guaranteed non-null here: send is gated on
                    account == null below, so a quota_exceeded response (and
                    therefore outOfCredits) can only ever arrive after
                    account has loaded. */}
                {outOfCredits && account ? (
                  <OutOfCreditsCard
                    tier={account.tier}
                    monthlyLimit={account.monthly_limit}
                  />
                ) : (
                  <>
                    {accountError && account == null && (
                      <p className="mb-2 text-xs text-text-muted">
                        Couldn&apos;t load your account.{" "}
                        <button
                          type="button"
                          className="pw-pressable underline hover:text-text"
                          onClick={() => window.location.reload()}
                        >
                          Retry
                        </button>
                      </p>
                    )}
                    {/* Brightness and light, centred directly above the text
                        box. flex-wrap drops the pair onto two centred lines on
                        a narrow screen; neither control shrinks (the stepper is
                        flex-none, the light pill truncates its own label), so
                        the row never scrolls sideways. */}
                    <div className="mb-3 flex flex-wrap items-center justify-center gap-3">
                      <BrightnessStepper
                        intent={intent}
                        onChange={setIntent}
                        disabled={outOfCredits || rateLimited || isSending}
                      />
                      <ConditionSelector
                        condition={condition}
                        intent={intent}
                        onConditionChange={setCondition}
                        disabled={outOfCredits || rateLimited || isSending}
                      />
                    </div>
                    <ChatComposer
                      ref={composerRef}
                      value={composerValue}
                      onChange={setComposerValue}
                      onSend={handleSend}
                      attachment={attachment}
                      onPickPhoto={handlePickPhoto}
                      onRemoveAttachment={handleRemoveAttachment}
                      onBeforePickerOpen={handleBeforePickerOpen}
                      placeholder={
                        account == null && accountError
                          ? "Couldn't load your account — retry above to continue"
                          : undefined
                      }
                      disabled={outOfCredits || rateLimited}
                      sendDisabled={outOfCredits || rateLimited || account == null}
                    />
                  </>
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
