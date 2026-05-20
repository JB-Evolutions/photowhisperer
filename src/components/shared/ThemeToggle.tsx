"use client";

export default function ThemeToggle() {
  function handleToggle() {
    const current = document.documentElement.getAttribute("data-theme");
    const next = current === "light" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("pw-theme", next);
    } catch {}
  }

  return (
    <>
      <style>{`
        .theme-toggle-btn {
          width: 38px;
          height: 38px;
          border-radius: 10px;
          border: 1px solid var(--border-strong);
          background: var(--surface);
          color: var(--text-muted);
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          transition: all 0.25s ease;
          padding: 0;
          flex-shrink: 0;
        }
        .theme-toggle-btn:hover {
          color: var(--text);
          border-color: var(--text-muted);
          transform: translateY(-1px);
        }
        .theme-toggle-btn svg {
          width: 16px;
          height: 16px;
        }
        .theme-toggle-btn .icon-sun { display: none; }
        :root[data-theme="light"] .theme-toggle-btn .icon-sun { display: block; }
        :root[data-theme="light"] .theme-toggle-btn .icon-moon { display: none; }
      `}</style>
      <button
        className="theme-toggle-btn"
        onClick={handleToggle}
        aria-label="Toggle theme"
        title="Toggle theme"
        type="button"
      >
        <svg
          className="icon-moon"
          viewBox="0 0 24 24"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path
            d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z"
            stroke="currentColor"
            strokeWidth="1.7"
            fill="none"
          />
        </svg>
        <svg
          className="icon-sun"
          viewBox="0 0 24 24"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.7" fill="none" />
          <line x1="12" y1="2" x2="12" y2="4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          <line x1="12" y1="20" x2="12" y2="22" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          <line x1="2" y1="12" x2="4" y2="12" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          <line x1="20" y1="12" x2="22" y2="12" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        </svg>
      </button>
    </>
  );
}
