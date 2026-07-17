"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Logo from "@/components/shared/Logo";
import Button from "@/components/shared/Button";
import ThemeToggle from "@/components/shared/ThemeToggle";
import { CreditsModal } from "@/components/shared/CreditsModal";
import FillBar from "@/components/shared/FillBar";
import { TIER_DISPLAY_NAMES } from "@/lib/quota";
import type { AccountData, SessionRow } from "@/app/app/page";

// ─── Helpers ──────────────────────────────────────────────────────────────────

interface SidebarProps {
  account: AccountData | null;
  sessions: SessionRow[];
  hasMore: boolean;
  loading: boolean;
  userEmail: string;
  accountError: boolean;
  sessionsError: boolean;
  activeSessionId: string | null;
  onNewScene: () => void;
  onSessionSelect: (id: string) => void;
  installSidebarVisible: boolean;
  onInstallClick: () => void;
}

function formatRelativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function getInitials(email: string): string {
  if (!email) return "?";
  const local = email.split("@")[0];
  const parts = local.split(/[._-]/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return local.slice(0, 2).toUpperCase();
}

const COMING_SOON = ["Taking photos", "Editing", "AI enhancement"] as const;

// ─── Sidebar ──────────────────────────────────────────────────────────────────

export default function Sidebar({
  account,
  sessions,
  hasMore,
  loading,
  userEmail,
  accountError,
  sessionsError,
  activeSessionId,
  onNewScene,
  onSessionSelect,
  installSidebarVisible,
  onInstallClick,
}: SidebarProps) {
  const router = useRouter();
  const tier = account?.tier ?? "snapshot";
  const tierLabel = TIER_DISPLAY_NAMES[tier];

  const total = (account?.monthly_limit ?? 0) + (account?.credits_remaining ?? 0);
  const used = account?.monthly_used ?? 0;
  const pct = total > 0 ? Math.min(100, (used / total) * 100) : 0;

  const [showCreditsModal, setShowCreditsModal] = useState(false);
  const plusButtonRef = useRef<HTMLButtonElement>(null);

  function handleCloseCreditsModal() {
    setShowCreditsModal(false);
    plusButtonRef.current?.focus();
  }

  // Mirrors BillingView.tsx handleUpgrade, parameterized by target tier and a
  // buttonId so the teaser and bottom-widget upgrade buttons (which can both
  // be visible at once for a snapshot user) track pending state independently.
  const [upgradePending, setUpgradePending] = useState<string | null>(null);
  const [teaserUpgradeError, setTeaserUpgradeError] = useState<string | null>(null);
  const [upgradeError, setUpgradeError] = useState<string | null>(null);

  async function handleUpgrade(
    targetTier: "portrait" | "studio",
    buttonId: string,
    setError: (msg: string | null) => void
  ) {
    if (upgradePending) return;
    setUpgradePending(buttonId);
    setError(null);
    try {
      const res = await fetch("/api/stripe/checkout/subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier: targetTier }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        setError(body.message ?? "Couldn't start checkout. Try again.");
        setUpgradePending(null);
        return;
      }
      const data = (await res.json()) as { url?: string };
      if (!data.url) {
        setError("Couldn't start checkout. Try again.");
        setUpgradePending(null);
        return;
      }
      window.location.href = data.url;
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
      setUpgradePending(null);
    }
  }

  return (
    <div className="flex h-full flex-col bg-surface">

      {/* (a) TOP: logo + wordmark + new scene */}
      <div className="flex-shrink-0 space-y-3 border-b border-border px-4 py-4">
        <div className="flex items-center gap-2.5">
          <Logo />
          <span className="font-display text-[15px] font-medium text-text pw-tracking-tight-1">
            PhotoWhisperer
          </span>
        </div>
        <Button
          variant="primary"
          fullWidth
          onClick={onNewScene}
        >
          New scene
        </Button>
      </div>

      {/* (b)+(c) SCROLLABLE MIDDLE: sessions heading + list + teaser */}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto py-3">
        <p className="mb-1 px-4 font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-text-dim">
          Recent sessions
        </p>

        {sessionsError ? (
          <p className="px-4 py-2 text-xs text-text-muted">
            Couldn&apos;t load sessions.{" "}
            <button
              type="button"
              className="underline hover:text-text"
              onClick={() => window.location.reload()}
            >
              Retry
            </button>
          </p>
        ) : loading ? (
          <>
            {[0, 1, 2].map((i) => (
              <div key={i} className="px-4 py-2.5">
                <div className="mb-1.5 h-3 w-3/4 animate-pulse rounded bg-surface-3" />
                <div className="h-2.5 w-1/3 animate-pulse rounded bg-surface-3" />
              </div>
            ))}
          </>
        ) : sessions.length === 0 ? (
          <p className="px-4 py-2 text-xs text-text-muted">
            Your sessions will appear here
          </p>
        ) : (
          <ul className="list-none">
            {sessions.map((s) => {
              const isActive = s.session_id === activeSessionId;
              return (
                <li key={s.session_id}>
                  <button
                    type="button"
                    title={s.title ?? "Untitled session"}
                    className={`w-full border-l-2 px-4 py-2.5 text-left transition-colors ${
                      isActive
                        ? "border-accent bg-surface-2"
                        : "border-transparent hover:bg-surface-2"
                    }`}
                    onClick={() => onSessionSelect(s.session_id)}
                  >
                    <p className="truncate text-sm text-text">
                      {s.title ?? "Untitled session"}
                    </p>
                    <p className="mt-0.5 font-mono text-[11px] text-text-dim">
                      {formatRelativeTime(s.updated_at)}
                    </p>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {/* (d) Snapshot teaser — only when snapshot tier AND has_more */}
        {!loading && !sessionsError && tier === "snapshot" && hasMore && (
          <div className="mx-4 mt-2 rounded-xl border border-border-accent bg-surface-2 p-3">
            <p className="mb-2 text-xs text-text-muted">
              Your earlier sessions are saved. Upgrade to access them all.
            </p>
            <Button
              variant="outline"
              onClick={() => void handleUpgrade("portrait", "teaser", setTeaserUpgradeError)}
              pending={upgradePending === "teaser"}
              pendingLabel="Starting…"
              disabled={upgradePending !== null}
            >
              Upgrade
            </Button>
            {teaserUpgradeError && (
              <p role="alert" className="mt-2 text-xs text-danger">{teaserUpgradeError}</p>
            )}
          </div>
        )}
      </div>

      {/* FIXED BOTTOM */}
      <div className="flex-shrink-0 border-t border-border">

        {/* (e) Coming soon — pinned, non-interactive */}
        <div className="px-4 py-3">
          <p className="mb-1.5 font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-text-dim">
            Coming soon
          </p>
          <ul className="list-none space-y-1.5" aria-label="Coming soon features">
            {COMING_SOON.map((label) => (
              <li
                key={label}
                className="flex cursor-default items-center justify-between opacity-40"
                aria-disabled="true"
              >
                <span className="text-xs text-text-muted">{label}</span>
                <span className="rounded-full bg-surface-3 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-widest text-text-dim">
                  soon
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* (f) Credits/usage widget + upgrade CTA */}
        <div className="border-t border-border px-4 py-3">
          {accountError ? (
            <p className="mb-2 text-xs text-text-muted">
              Couldn&apos;t load usage.{" "}
              <button
                type="button"
                className="underline hover:text-text"
                onClick={() => window.location.reload()}
              >
                Retry
              </button>
            </p>
          ) : loading ? (
            <div className="mb-2 h-2 w-full animate-pulse rounded-full bg-surface-3" />
          ) : (
            <>
              <div className="mb-1.5 flex items-center justify-between">
                <span className="font-mono text-[11px] text-text-muted">
                  {used} / {total} used
                </span>
                <button
                  ref={plusButtonRef}
                  type="button"
                  className="flex h-5 w-5 items-center justify-center rounded text-text-dim transition-colors hover:text-text"
                  onClick={() => setShowCreditsModal(true)}
                  aria-label="Buy more credits"
                  title="Buy more credits"
                >
                  <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor" aria-hidden="true">
                    <path d="M7.25 7.25V2h1.5v5.25H14v1.5H8.75V14h-1.5V8.75H2v-1.5h5.25Z" />
                  </svg>
                </button>
              </div>
              <FillBar pct={pct} trackClassName="h-1 w-full overflow-hidden rounded-full bg-surface-3" />
            </>
          )}

          {!loading && !accountError && tier !== "studio" && (
            <>
              <Button
                variant="outline"
                fullWidth
                className="mt-3"
                onClick={() =>
                  void handleUpgrade(
                    tier === "snapshot" ? "portrait" : "studio",
                    "widget",
                    setUpgradeError
                  )
                }
                pending={upgradePending === "widget"}
                pendingLabel="Starting…"
                disabled={upgradePending !== null}
              >
                {tier === "snapshot" ? "Upgrade to Portrait" : "Upgrade to Studio"}
              </Button>
              {upgradeError && (
                <p role="alert" className="mt-2 text-xs text-danger">{upgradeError}</p>
              )}
            </>
          )}
        </div>

        {/* Add to home screen — always available regardless of banner dismissal */}
        {installSidebarVisible && (
          <div className="border-t border-border px-4 py-3">
            <button
              type="button"
              onClick={onInstallClick}
              className="flex w-full items-center gap-2.5 rounded-[10px] border border-border-strong bg-surface px-3 py-2.5 text-sm text-text-muted transition-all hover:-translate-y-px hover:border-text-muted hover:text-text"
            >
              <svg
                viewBox="0 0 24 24"
                width="16"
                height="16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M12 3v12" />
                <path d="M7 10l5 5 5-5" />
                <path d="M5 21h14" />
              </svg>
              Add to home screen
            </button>
          </div>
        )}

        {/* Account row */}
        <div className="flex items-center gap-2 border-t border-border px-3 py-3">
          <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-surface-3 font-body text-xs font-medium text-text">
            {getInitials(userEmail)}
          </div>
          <span className="min-w-0 flex-1 truncate text-xs text-text-muted">
            {tierLabel}
          </span>
          <ThemeToggle />
          <button
            type="button"
            className="flex h-[38px] w-[38px] flex-shrink-0 items-center justify-center rounded-[10px] border border-border-strong bg-surface text-text-muted transition-all hover:-translate-y-px hover:border-text-muted hover:text-text"
            onClick={() => router.push("/account")}
            aria-label="Settings"
            title="Settings"
          >
            <svg
              viewBox="0 0 24 24"
              width="16"
              height="16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
            </svg>
          </button>
        </div>

      </div>

      {showCreditsModal && <CreditsModal onClose={handleCloseCreditsModal} />}
    </div>
  );
}
