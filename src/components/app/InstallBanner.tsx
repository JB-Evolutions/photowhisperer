"use client";

import Logo from "@/components/shared/Logo";
import Button from "@/components/shared/Button";
import type { InstallPlatform } from "@/hooks/useInstallPrompt";

interface InstallBannerProps {
  visible: boolean;
  platform: InstallPlatform;
  onInstall: () => void;
  onDismissSession: () => void;
  onDismissForever: () => void;
}

export default function InstallBanner({
  visible,
  platform,
  onInstall,
  onDismissSession,
  onDismissForever,
}: InstallBannerProps) {
  if (!visible || platform === null) return null;

  return (
    <div
      role="region"
      aria-label="Install app"
      className="relative mb-2 flex items-start gap-3 rounded-[12px] border border-border-accent bg-surface px-4 py-3.5"
    >
      <Logo />
      <div className="min-w-0 flex-1 pr-5">
        <p className="text-sm font-medium text-text">
          Add PhotoWhisperer to your home screen
        </p>
        <p className="mt-0.5 text-xs text-text-muted">
          One tap to open, no typing the URL
        </p>
        <div className="mt-3 flex items-center gap-4">
          <Button variant="primary" onClick={onInstall}>
            Install
          </Button>
          <button
            type="button"
            onClick={onDismissForever}
            className="text-xs text-text-dim underline-offset-2 hover:text-text-muted hover:underline"
          >
            Don&apos;t remind me
          </button>
        </div>
      </div>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={onDismissSession}
        className="absolute right-3 top-3 leading-none text-text-dim hover:text-text-muted"
      >
        ×
      </button>
    </div>
  );
}
