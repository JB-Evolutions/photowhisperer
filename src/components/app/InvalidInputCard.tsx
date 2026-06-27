"use client";

interface InvalidInputCardProps {
  message: string;
  consecutiveCount?: number;
  onSeeExamples?: () => void;
}

export default function InvalidInputCard({
  message,
  consecutiveCount,
  onSeeExamples,
}: InvalidInputCardProps) {
  const showExamples = (consecutiveCount ?? 0) >= 3;

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="mb-3 flex items-center gap-1.5">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="flex-shrink-0 text-text-muted">
          <circle cx="12" cy="12" r="10" />
          <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
          <path d="M12 17h.01" />
        </svg>
        <span className="text-[11px] font-medium uppercase tracking-widest text-text-muted">
          Not quite enough to go on
        </span>
      </div>
      <p className="text-[15px] leading-relaxed text-text">{message}</p>
      {showExamples && (
        <button
          type="button"
          onClick={onSeeExamples}
          className={[
            "mt-3 text-[13px] text-text-muted",
            "transition-colors duration-200 ease-[cubic-bezier(0.2,0,0,1)]",
            "hover:text-text",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-accent)]",
          ].join(" ")}
        >
          See examples
        </button>
      )}
    </div>
  );
}
