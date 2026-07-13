import type { Metadata, Viewport } from "next";
import { Fraunces, Geist, JetBrains_Mono } from "next/font/google";
import { headers } from "next/headers";
import GoogleAnalytics from "@/components/analytics/GoogleAnalytics";
import CookieConsentBanner from "@/components/analytics/CookieConsentBanner";
import "./globals.css";

const fraunces = Fraunces({
  axes: ["opsz"],
  variable: "--font-display",
  subsets: ["latin"],
  display: "swap",
});

const geist = Geist({
  weight: ["300", "400", "500", "600"],
  variable: "--font-body",
  subsets: ["latin"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  weight: ["400", "500"],
  variable: "--font-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "PhotoWhisperer",
  description: "Describe the scene. Get the camera settings.",
  appleWebApp: {
    capable: true,
    title: "PhotoWhisperer",
    statusBarStyle: "black",
  },
  other: {
    // Next's appleWebApp field only emits the modern "mobile-web-app-capable"
    // tag in this version — iOS Safari before 17.4 only honors the legacy
    // apple-prefixed name, so it's added manually to cover both.
    "apple-mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

const foucScript = `(function() {
  try {
    var stored = localStorage.getItem('pw-theme');
    document.documentElement.setAttribute('data-theme', stored === 'light' ? 'light' : 'dark');
    requestAnimationFrame(function() {
      requestAnimationFrame(function() {
        document.documentElement.removeAttribute('data-loading');
      });
    });
  } catch (e) {}
})();`;

// Registers the real beforeinstallprompt/appinstalled listeners synchronously
// at parse time, before any JS bundle loads or React hydrates — a prompt that
// fires early in page load (which it often does) would otherwise be lost if
// the listener were only added inside a React effect. useInstallPrompt (see
// src/hooks/useInstallPrompt.ts) never listens for beforeinstallprompt itself;
// it just reads window.__pwaDeferredPrompt and the two custom events this
// script dispatches. Key name here must match INSTALLED_KEY in src/lib/pwa.ts.
const pwaInstallScript = `(function() {
  window.__pwaDeferredPrompt = null;
  window.addEventListener('beforeinstallprompt', function(e) {
    e.preventDefault();
    window.__pwaDeferredPrompt = e;
    window.dispatchEvent(new Event('pwa-install-available'));
  });
  window.addEventListener('appinstalled', function() {
    try { localStorage.setItem('pw-install-installed', '1'); } catch (e) {}
    window.__pwaDeferredPrompt = null;
    window.dispatchEvent(new Event('pwa-app-installed'));
  });
})();`;

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <html
      lang="en"
      data-theme="dark"
      data-loading="true"
      suppressHydrationWarning
      className={`${fraunces.variable} ${geist.variable} ${jetbrainsMono.variable}`}
    >
      <body suppressHydrationWarning>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: foucScript }} />
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: pwaInstallScript }} />
        <GoogleAnalytics nonce={nonce} />
        {children}
        <CookieConsentBanner />
      </body>
    </html>
  );
}
