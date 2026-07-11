export default function Logo() {
  return (
    <div className="pw-logo-badge">
      {/* Inset highlight overlay */}
      <span aria-hidden="true" className="pw-logo-badge-highlight" />
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="pw-logo-badge-icon"
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M12 3l4 9-9 1" />
        <path d="M21 12l-9 4-1-9" />
        <path d="M3 12l9-4 1 9" />
      </svg>
    </div>
  );
}
