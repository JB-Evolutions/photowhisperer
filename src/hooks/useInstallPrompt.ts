"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DISMISSED_SESSION_KEY,
  HAS_COMPLETED_SCENE_KEY,
  INSTALLED_KEY,
  NEVER_REMIND_KEY,
  isAndroidDevice,
  isIOSDevice,
  isStandalone,
  shouldShowInstallBanner,
  shouldShowInstallSidebarItem,
  type BeforeInstallPromptEvent,
} from "@/lib/pwa";

export type InstallPlatform = "ios" | "android" | null;

export function useInstallPrompt() {
  const router = useRouter();

  const [hasCompletedScene, setHasCompletedScene] = useState(false);
  const [dismissedSession, setDismissedSession] = useState(false);
  const [neverRemind, setNeverRemind] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [standalone, setStandalone] = useState(false);
  const [platform, setPlatform] = useState<InstallPlatform>(null);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    setStandalone(isStandalone());
    setPlatform(isIOSDevice() ? "ios" : isAndroidDevice() ? "android" : null);
    setHasCompletedScene(window.localStorage.getItem(HAS_COMPLETED_SCENE_KEY) === "1");
    setDismissedSession(window.sessionStorage.getItem(DISMISSED_SESSION_KEY) === "1");
    setNeverRemind(window.localStorage.getItem(NEVER_REMIND_KEY) === "1");
    setInstalled(window.localStorage.getItem(INSTALLED_KEY) === "1");

    // The actual beforeinstallprompt/appinstalled listeners live in the
    // pwaInstallScript inline script in layout.tsx (registered before this
    // ever mounts). This effect only syncs React state to what that script
    // has already captured — see the comment there for why.
    if (window.__pwaDeferredPrompt) {
      setDeferredPrompt(window.__pwaDeferredPrompt);
    }

    function onAvailable() {
      setDeferredPrompt(window.__pwaDeferredPrompt);
    }
    function onInstalled() {
      setInstalled(true);
      setDeferredPrompt(null);
    }
    window.addEventListener("pwa-install-available", onAvailable);
    window.addEventListener("pwa-app-installed", onInstalled);
    return () => {
      window.removeEventListener("pwa-install-available", onAvailable);
      window.removeEventListener("pwa-app-installed", onInstalled);
    };
  }, []);

  const markSceneCompleted = useCallback(() => {
    window.localStorage.setItem(HAS_COMPLETED_SCENE_KEY, "1");
    setHasCompletedScene(true);
  }, []);

  // Session-scoped by design: sessionStorage clears on the next visit so the
  // banner can reappear, unlike dismissForever below.
  const dismissSession = useCallback(() => {
    window.sessionStorage.setItem(DISMISSED_SESSION_KEY, "1");
    setDismissedSession(true);
  }, []);

  const dismissForever = useCallback(() => {
    window.localStorage.setItem(NEVER_REMIND_KEY, "1");
    setNeverRemind(true);
  }, []);

  // Shared by both the banner's Install button and the sidebar entry so
  // their behavior can never drift apart.
  const triggerInstall = useCallback(async () => {
    if (platform === "ios") {
      router.push("/install");
      return;
    }
    if (platform === "android" && deferredPrompt) {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      window.__pwaDeferredPrompt = null;
      setDeferredPrompt(null);
      if (choice.outcome === "accepted") {
        window.localStorage.setItem(INSTALLED_KEY, "1");
        setInstalled(true);
      }
    }
  }, [platform, deferredPrompt, router]);

  const bannerVisible = shouldShowInstallBanner({
    hasCompletedScene,
    standalone,
    dismissedSession,
    neverRemind,
    installed,
    isIOSDevice: platform === "ios",
    isAndroidDevice: platform === "android",
    hasAndroidPrompt: deferredPrompt !== null,
  });

  const sidebarVisible = shouldShowInstallSidebarItem({
    standalone,
    installed,
    isIOSDevice: platform === "ios",
    isAndroidDevice: platform === "android",
    hasAndroidPrompt: deferredPrompt !== null,
  });

  return {
    platform,
    bannerVisible,
    sidebarVisible,
    markSceneCompleted,
    dismissSession,
    dismissForever,
    triggerInstall,
  };
}
