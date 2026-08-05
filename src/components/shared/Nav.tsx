import Link from "next/link";
import Logo from "./Logo";
import ThemeToggle from "./ThemeToggle";
import Button from "./Button";
import MobileNavMenu from "./MobileNavMenu";
import { getMarketingAuthState } from "@/lib/auth-state";
import { TIER_DISPLAY_NAMES } from "@/lib/quota";
import "@/components/marketing/marketing.css";

const NAV_LINKS = [
  { label: "Features", href: "/#features" },
  { label: "How it works", href: "/how-it-works" },
  { label: "Pricing", href: "/pricing" },
  { label: "Blog", href: "/blog" },
  { label: "FAQ", href: "/#faq" },
];

export default async function Nav() {
  const { isLoggedIn, tier } = await getMarketingAuthState();

  return (
    <>
      <nav className="pw-top">
        <div className="pw-nav-inner">
          <Link href="/" className="pw-nav-brand">
            <Logo />
            <span className="pw-nav-wordmark">PhotographyWhisperer</span>
          </Link>

          {/* TODO(9.13): collapse to a hamburger + full-screen overlay below `md`
              (links stacked, theme toggle top, auth buttons thumb-reachable at bottom).
              Deferred — auth/CTA buttons and theme toggle remain visible on mobile,
              only this link list hides. */}
          <ul className="hidden lg:flex items-center gap-7 list-none">
            {NAV_LINKS.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="text-sm text-text-muted tracking-[0.01em] transition-colors hover:text-text"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>

          <div className="hidden lg:flex items-center gap-2 sm:gap-2.5">
            {isLoggedIn ? (
              <>
                <span className="hidden sm:inline font-mono text-xs uppercase tracking-[0.08em] text-text-muted">
                  {TIER_DISPLAY_NAMES[tier ?? "snapshot"]}
                </span>
                <span className="hidden sm:inline-flex">
                  <Button href="/app" variant="outline">
                    Open app
                  </Button>
                </span>
                <Button href="/app" variant="primary">
                  New scene
                </Button>
              </>
            ) : (
              <>
                <span className="hidden sm:inline-flex">
                  <Button href="/auth/signin" variant="ghost">
                    Sign in
                  </Button>
                </span>
                <Button
                  href="/auth/signup"
                  variant="primary"
                  className="max-sm:!px-3 max-sm:!py-2"
                >
                  <span className="sm:hidden">Get settings</span>
                  <span className="hidden sm:inline">Get my settings</span>
                </Button>
              </>
            )}
            <ThemeToggle />
          </div>

          <MobileNavMenu links={NAV_LINKS} isLoggedIn={isLoggedIn} tier={tier} />
        </div>
      </nav>
    </>
  );
}
