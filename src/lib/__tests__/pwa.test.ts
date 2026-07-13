import { describe, it, expect } from "vitest";
import { shouldShowInstallBanner, shouldShowInstallSidebarItem } from "../pwa";

const BASE_BANNER = {
  hasCompletedScene: true,
  standalone: false,
  dismissedSession: false,
  neverRemind: false,
  installed: false,
  isIOSDevice: false,
  isAndroidDevice: false,
  hasAndroidPrompt: false,
};

describe("shouldShowInstallBanner", () => {
  it("hidden before the first successful scene, even on iOS", () =>
    expect(
      shouldShowInstallBanner({ ...BASE_BANNER, hasCompletedScene: false, isIOSDevice: true })
    ).toBe(false));

  it("iOS: visible once a scene has completed", () =>
    expect(shouldShowInstallBanner({ ...BASE_BANNER, isIOSDevice: true })).toBe(true));

  it("Android: hidden if beforeinstallprompt never fired", () =>
    expect(
      shouldShowInstallBanner({ ...BASE_BANNER, isAndroidDevice: true, hasAndroidPrompt: false })
    ).toBe(false));

  it("Android: visible once beforeinstallprompt fired", () =>
    expect(
      shouldShowInstallBanner({ ...BASE_BANNER, isAndroidDevice: true, hasAndroidPrompt: true })
    ).toBe(true));

  it("desktop (neither iOS nor Android UA): always hidden", () =>
    expect(shouldShowInstallBanner({ ...BASE_BANNER })).toBe(false));

  it("never shown when already running standalone", () =>
    expect(
      shouldShowInstallBanner({ ...BASE_BANNER, isIOSDevice: true, standalone: true })
    ).toBe(false));

  it("× dismiss (session) hides it", () =>
    expect(
      shouldShowInstallBanner({ ...BASE_BANNER, isIOSDevice: true, dismissedSession: true })
    ).toBe(false));

  it('"Don\'t remind me" hides it', () =>
    expect(
      shouldShowInstallBanner({ ...BASE_BANNER, isIOSDevice: true, neverRemind: true })
    ).toBe(false));

  it("installed hides it", () =>
    expect(
      shouldShowInstallBanner({ ...BASE_BANNER, isIOSDevice: true, installed: true })
    ).toBe(false));
});

const BASE_SIDEBAR = {
  standalone: false,
  installed: false,
  isIOSDevice: false,
  isAndroidDevice: false,
  hasAndroidPrompt: false,
};

describe("shouldShowInstallSidebarItem", () => {
  it("iOS: visible without needing a completed scene or dismissal state", () =>
    expect(shouldShowInstallSidebarItem({ ...BASE_SIDEBAR, isIOSDevice: true })).toBe(true));

  it("Android: visible only once beforeinstallprompt fired", () => {
    expect(
      shouldShowInstallSidebarItem({ ...BASE_SIDEBAR, isAndroidDevice: true, hasAndroidPrompt: false })
    ).toBe(false);
    expect(
      shouldShowInstallSidebarItem({ ...BASE_SIDEBAR, isAndroidDevice: true, hasAndroidPrompt: true })
    ).toBe(true);
  });

  it("desktop: always hidden", () =>
    expect(shouldShowInstallSidebarItem({ ...BASE_SIDEBAR })).toBe(false));

  it("never shown when already standalone", () =>
    expect(
      shouldShowInstallSidebarItem({ ...BASE_SIDEBAR, isIOSDevice: true, standalone: true })
    ).toBe(false));

  it("hidden once installed", () =>
    expect(
      shouldShowInstallSidebarItem({ ...BASE_SIDEBAR, isIOSDevice: true, installed: true })
    ).toBe(false));
});
