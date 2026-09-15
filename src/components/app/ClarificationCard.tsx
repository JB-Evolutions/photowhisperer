import { CLARIFICATION_PROMPT, type ClarificationChip } from "@/components/app/conditions";

interface ClarificationCardProps {
  question: string;
  // Shown at most once per session, and only for photo requests — tapping
  // one resubmits immediately with that condition.
  chips?: readonly ClarificationChip[];
  onChipSelect?: (chip: ClarificationChip) => void;
}

export default function ClarificationCard({ question, chips, onChipSelect }: ClarificationCardProps) {
  const showChips = Boolean(chips && chips.length > 0 && onChipSelect);

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

      {showChips && (
        <div className="mt-4 border-t border-border pt-3">
          {question.trim() !== CLARIFICATION_PROMPT && (
            <p className="mb-2 text-sm text-text-muted">{CLARIFICATION_PROMPT}</p>
          )}
          <div role="group" aria-label={CLARIFICATION_PROMPT} className="flex flex-wrap gap-2">
            {chips!.map((chip) => (
              <button
                key={chip.condition}
                type="button"
                onClick={() => onChipSelect!(chip)}
                className={[
                  "inline-flex min-h-[44px] items-center rounded-full border border-border bg-surface-2 px-4 text-sm text-text",
                  "transition-colors duration-200 ease-[cubic-bezier(0.2,0,0,1)] hover:border-border-strong",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-accent)]",
                ].join(" ")}
              >
                {chip.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
