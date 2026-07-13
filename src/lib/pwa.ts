export const HAS_COMPLETED_SCENE_KEY = "pw-has-completed-scene";
export const DISMISSED_SESSION_KEY = "pw-install-dismissed-session";
export const NEVER_REMIND_KEY = "pw-install-never-remind";
// Must match the literal key name in the pwaInstallScript inline script in
// src/app/layout.tsx, which writes this from plain JS before React hydrates.
export const INSTALLED_KEY = "pw-install-installed";

export interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
  prompt(): Promise<void>;
}

declare global {
  interface WindowEventMap {
    "beforeinstallprompt": BeforeInstallPromptEvent;
    "pwa-install-available": Event;
    "pwa-app-installed": Event;
  }
  interface Window {
    __pwaDeferredPrompt: BeforeInstallPromptEvent | null;
  }
}

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true;
}

export function isIOSDevice(): boolean {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  // iPadOS 13+ reports as "MacIntel" in the UA — only distinguishable from a
  // real Mac by touch support, which desktop Macs don't have.
  return window.navigator.platform === "MacIntel" && window.navigator.maxTouchPoints > 1;
}

export function isAndroidDevice(): boolean {
  if (typeof window === "undefined") return false;
  return /Android/.test(window.navigator.userAgent);
}

interface InstallEligibility {
  hasCompletedScene: boolean;
  standalone: boolean;
  dismissedSession: boolean;
  neverRemind: boolean;
  installed: boolean;
  isIOSDevice: boolean;
  isAndroidDevice: boolean;
  hasAndroidPrompt: boolean;
}

// Pure so it's unit-testable without mounting anything — mirrors the
// getBannerState pattern in SubscriptionBanner.tsx.
export function shouldShowInstallBanner(state: InstallEligibility): boolean {
  if (!state.hasCompletedScene) return false;
  if (state.standalone) return false;
  if (state.dismissedSession) return false;
  if (state.neverRemind) return false;
  if (state.installed) return false;
  if (state.isIOSDevice) return true;
  // Android only gets a real one-tap install via the captured event — no
  // event means unsupported or already installed, so stay hidden rather
  // than show a button that can't do anything.
  if (state.isAndroidDevice) return state.hasAndroidPrompt;
  // Desktop (neither iOS nor Android UA): homescreen install doesn't apply.
  return false;
}

interface SidebarInstallEligibility {
  standalone: boolean;
  installed: boolean;
  isIOSDevice: boolean;
  isAndroidDevice: boolean;
  hasAndroidPrompt: boolean;
}

// The always-available sidebar entry deliberately ignores hasCompletedScene
// and the two dismissal states — dismissing the banner must never cost the
// user the one-tap install path.
export function shouldShowInstallSidebarItem(state: SidebarInstallEligibility): boolean {
  if (state.standalone) return false;
  if (state.installed) return false;
  if (state.isIOSDevice) return true;
  if (state.isAndroidDevice) return state.hasAndroidPrompt;
  return false;
}
