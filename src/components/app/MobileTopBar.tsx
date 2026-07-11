"use client";

interface MobileTopBarProps {
  onMenuClick: () => void;
}

export default function MobileTopBar({ onMenuClick }: MobileTopBarProps) {
  return (
    <div className="flex items-center gap-3 border-b border-border bg-surface px-2 py-2 md:hidden">
      <button
        type="button"
        className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg text-text transition-colors hover:bg-surface-2"
        onClick={onMenuClick}
        aria-label="Open navigation menu"
      >
        <svg
          viewBox="0 0 24 24"
          width="20"
          height="20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>
      <span className="font-display text-[15px] font-medium text-text-muted pw-tracking-tight-1">
        Untitled session
      </span>
    </div>
  );
}
