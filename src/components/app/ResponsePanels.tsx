interface ResponsePanelsProps {
  scene_summary?: string;
  assumptions: string[];
  warnings: string[];
}

export default function ResponsePanels({
  scene_summary,
  assumptions,
  warnings,
}: ResponsePanelsProps) {
  const hasAssumptions = assumptions.length > 0;
  const hasWarnings    = warnings.length > 0;
  const hasPair        = hasAssumptions || hasWarnings;

  return (
    <div className="flex flex-col gap-3">

      {/* Scene summary — always full width */}
      {scene_summary && (
        <div className="rounded-xl border border-border bg-surface p-4 text-sm leading-relaxed">
          <div className="mb-1.5 flex items-center gap-1.5">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="flex-shrink-0 text-text-muted">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 16v-4M12 8h.01" />
            </svg>
            <span className="text-[11px] font-medium uppercase tracking-widest text-text-muted">Scene Summary</span>
          </div>
          <p className="text-text">{scene_summary}</p>
        </div>
      )}

      {/* Assumptions + Warnings — side-by-side at md+, stacked below */}
      {hasPair && (
        <div className={`grid gap-3 ${hasAssumptions && hasWarnings ? "md:grid-cols-2" : "grid-cols-1"}`}>

          {hasAssumptions && (
            <div className="rounded-xl border border-border bg-surface p-4 text-sm leading-relaxed">
              <div className="mb-1.5 flex items-center gap-1.5">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="flex-shrink-0 text-text-muted">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span className="text-[11px] font-medium uppercase tracking-widest text-text-muted">Assumptions</span>
              </div>
              <p className="text-text">{assumptions.join(" · ")}</p>
            </div>
          )}

          {hasWarnings && (
            <div className="rounded-xl border border-warning bg-surface p-4 text-sm leading-relaxed">
              <div className="mb-1.5 flex items-center gap-1.5">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="flex-shrink-0 text-warning">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                <span className="text-[11px] font-medium uppercase tracking-widest text-warning">Warnings</span>
              </div>
              <p className="text-text">{warnings.join(" · ")}</p>
            </div>
          )}

        </div>
      )}

    </div>
  );
}
