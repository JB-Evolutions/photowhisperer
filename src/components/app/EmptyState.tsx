"use client";

import type { ReactNode } from "react";

const CHIPS = [
  "Backlit portrait at golden hour, 85mm, handheld",
  "Indoor newborn near a north-facing window",
  "Bird in flight, overcast, 400mm",
  "Long exposure waterfall on a tripod",
] as const;

const chipBase = [
  "rounded-full bg-surface border border-border text-text-muted",
  "px-4 py-2 text-sm font-body min-h-[44px]",
  "transition-[border-color,color,background-color,transform]",
  "duration-200 ease-[cubic-bezier(0.2,0,0,1)]",
  "hover:border-border-accent hover:text-text hover:bg-surface-2",
  "active:scale-[0.98]",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent",
  "disabled:opacity-40 disabled:cursor-not-allowed",
].join(" ");

interface EmptyStateProps {
  onChipSelect: (text: string) => void;
  disabled?: boolean;
  outOfCreditsNotice?: ReactNode;
}

export default function EmptyState({
  onChipSelect,
  disabled = false,
  outOfCreditsNotice,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-8 px-6 py-12 text-center">
      <h1 className="font-display text-3xl font-medium text-text pw-tracking-tight-2">
        What are you shooting?
      </h1>

      <div className="flex flex-wrap justify-center gap-2.5">
        {CHIPS.map((chip) => (
          <button
            key={chip}
            type="button"
            disabled={disabled}
            className={chipBase}
            onClick={() => onChipSelect(chip)}
          >
            {chip}
          </button>
        ))}
      </div>

      {disabled && outOfCreditsNotice && (
        <div className="max-w-sm text-sm text-text-muted">
          {outOfCreditsNotice}
        </div>
      )}
    </div>
  );
}
