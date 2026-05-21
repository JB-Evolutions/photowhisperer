import Link from "next/link";
import Logo from "./Logo";
import ThemeToggle from "./ThemeToggle";

export default function Nav() {
  return (
    <>
      <style>{`
        nav.pw-top {
          position: sticky;
          top: 0;
          z-index: 100;
          backdrop-filter: blur(20px) saturate(180%);
          -webkit-backdrop-filter: blur(20px) saturate(180%);
          background: color-mix(in srgb, var(--bg) 70%, transparent);
          border-bottom: 1px solid var(--border);
          transition: background 0.4s ease, border-color 0.4s ease;
        }
        .pw-nav-inner {
          max-width: 1280px;
          margin: 0 auto;
          padding: 16px 32px;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .pw-nav-brand {
          display: flex;
          align-items: center;
          gap: 12px;
          text-decoration: none;
          color: inherit;
        }
        .pw-nav-wordmark {
          font-family: var(--font-display);
          font-size: 18px;
          font-weight: 500;
          color: var(--text);
          letter-spacing: -0.01em;
        }
      `}</style>
      <nav className="pw-top">
        <div className="pw-nav-inner">
          <Link href="/" className="pw-nav-brand">
            <Logo />
            <span className="pw-nav-wordmark">PhotoWhisperer</span>
          </Link>
          <ThemeToggle />
        </div>
      </nav>
    </>
  );
}
