import Link from "next/link";
import CookieSettingsLink from "@/components/marketing/CookieSettingsLink";

const PRODUCT_LINKS = [
  { href: "/#features", label: "Features" },
  { href: "/pricing", label: "Pricing" },
  { href: "/#faq", label: "FAQ" },
];

const LEGAL_LINKS = [
  { href: "/terms", label: "Terms" },
  { href: "/privacy", label: "Privacy" },
];

const linkClass =
  "text-sm text-text-muted transition-colors duration-[250ms] ease-[cubic-bezier(0.16,1,0.3,1)] hover:text-text";

function MailIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m4 6 8 7 8-7" />
    </svg>
  );
}

export default function MarketingFooter() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto max-w-[1280px] px-8 py-16">
        <div className="grid grid-cols-1 gap-12 md:grid-cols-3">
          <div>
            <h3 className="font-body text-xs uppercase tracking-[0.08em] text-text-dim">
              Product
            </h3>
            <ul className="mt-4 flex flex-col gap-3 list-none">
              {PRODUCT_LINKS.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className={linkClass}>
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="font-body text-xs uppercase tracking-[0.08em] text-text-dim">
              Legal
            </h3>
            <ul className="mt-4 flex flex-col gap-3 list-none">
              {LEGAL_LINKS.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className={linkClass}>
                    {link.label}
                  </Link>
                </li>
              ))}
              <li>
                <CookieSettingsLink />
              </li>
            </ul>
          </div>

          <div>
            <h3 className="font-body text-xs uppercase tracking-[0.08em] text-text-dim">
              Contact
            </h3>
            <a
              href="mailto:support@photographywhisperer.com"
              className={`mt-4 inline-flex items-center gap-2 ${linkClass}`}
            >
              <MailIcon />
              Contact us
            </a>
          </div>
        </div>

        <div className="mt-12 border-t border-border pt-8 text-xs text-text-dim">
          © {new Date().getFullYear()} PhotoWhisperer
        </div>
      </div>
    </footer>
  );
}
