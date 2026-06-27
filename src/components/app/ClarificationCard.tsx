interface ClarificationCardProps {
  question: string;
}

export default function ClarificationCard({ question }: ClarificationCardProps) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="mb-3 flex items-center gap-1.5">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="flex-shrink-0 text-text-muted">
          <circle cx="12" cy="12" r="10" />
          <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
          <path d="M12 17h.01" />
        </svg>
        <span className="text-[11px] font-medium uppercase tracking-widest text-text-muted">
          Need a bit more info
        </span>
      </div>
      <p className="font-display text-[18px] leading-snug text-text">{question}</p>
    </div>
  );
}
