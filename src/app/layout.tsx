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
  icons: { icon: "/logo.png" },
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
        <GoogleAnalytics nonce={nonce} />
        {children}
        <CookieConsentBanner />
      </body>
    </html>
  );
}
