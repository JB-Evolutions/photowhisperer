"use client";

// Radio-group segmented control. Selected state is neutral, not gold — gold
// is reserved for send and confirm.
import { useRef, type KeyboardEvent } from "react";

export type SegmentOption<T extends string> = { value: T; label: string };

interface SegmentedProps<T extends string> {
  label: string;
  options: readonly SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
}

export default function Segmented<T extends string>({ label, options, value, onChange }: SegmentedProps<T>) {
  const groupRef = useRef<HTMLDivElement>(null);

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const keys = ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"];
    if (!keys.includes(e.key)) return;
    e.preventDefault();
    const i = options.findIndex((o) => o.value === value);
    const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : -1;
    const next = options[(i + step + options.length) % options.length];
    onChange(next.value);
    groupRef.current?.querySelector<HTMLElement>(`[data-value="${next.value}"]`)?.focus();
  }

  return (
    <div
      ref={groupRef}
      role="radiogroup"
      aria-label={label}
      onKeyDown={handleKeyDown}
      className="grid auto-cols-fr grid-flow-col gap-1 rounded-xl border border-border bg-surface-2 p-1"
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            data-value={option.value}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(option.value)}
            className={[
              "min-h-[44px] rounded-lg border px-2 text-[13px] leading-5",
              "transition-colors duration-200 ease-[cubic-bezier(0.2,0,0,1)]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-accent)]",
              selected
                ? "border-border-strong bg-surface-3 text-text"
                : "border-transparent text-text-muted hover:text-text",
            ].join(" ")}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
