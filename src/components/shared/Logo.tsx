export default function Logo() {
  return (
    <div
      style={{
        width: 36,
        height: 36,
        borderRadius: 10,
        background: "linear-gradient(135deg, var(--accent) 0%, var(--accent-3) 100%)",
        boxShadow: "0 4px 14px var(--accent-glow)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
        flexShrink: 0,
      }}
    >
      {/* Inset highlight overlay */}
      <span
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: -1,
          borderRadius: 11,
          background:
            "linear-gradient(135deg, rgba(255,255,255,0.4), transparent 40%)",
          pointerEvents: "none",
        }}
      />
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{
          width: 20,
          height: 20,
          color: "var(--tile-text-on-accent)",
          position: "relative",
        }}
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M12 3l4 9-9 1" />
        <path d="M21 12l-9 4-1-9" />
        <path d="M3 12l9-4 1 9" />
      </svg>
    </div>
  );
}
