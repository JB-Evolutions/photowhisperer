"use client";

// Two-axis light picker under the composer. Never a mandatory step: "Let it
// decide" and Natural are the defaults, and the choice rides on every request
// for the rest of the session.
import { useId, useRef, useState, type KeyboardEvent } from "react";
import type { BrightnessIntent, LightCondition } from "@/lib/contract/types";
import {
  CONDITION_GROUPS,
  INTENT_OPTIONS,
  LET_IT_DECIDE_LABEL,
  selectionSummary,
} from "@/components/app/conditions";

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-accent)]";

function chipClass(selected: boolean) {
  return [
    "inline-flex min-h-[44px] items-center rounded-full border px-4 text-sm",
    "transition-colors duration-200 ease-[cubic-bezier(0.2,0,0,1)]",
    selected
      ? "border-border-strong bg-surface-3 text-text"
      : "border-border bg-surface text-text-muted hover:text-text",
    focusRing,
  ].join(" ");
}

// WAI-ARIA radio pattern: arrow keys move focus and selection together
// within one group; only the checked radio sits in the tab order.
function moveRadioFocus(e: KeyboardEvent<HTMLElement>) {
  const forward = e.key === "ArrowRight" || e.key === "ArrowDown";
  const backward = e.key === "ArrowLeft" || e.key === "ArrowUp";
  if (!forward && !backward) return;
  const radios = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]'));
  const i = radios.indexOf(document.activeElement as HTMLElement);
  if (i === -1) return;
  e.preventDefault();
  const next = radios[(i + (forward ? 1 : -1) + radios.length) % radios.length];
  next.focus();
  next.click();
}

interface ConditionSelectorProps {
  condition: LightCondition | null;
  intent: BrightnessIntent;
  onConditionChange: (condition: LightCondition | null) => void;
  onIntentChange: (intent: BrightnessIntent) => void;
  disabled?: boolean;
}

export default function ConditionSelector({
  condition,
  intent,
  onConditionChange,
  onIntentChange,
  disabled = false,
}: ConditionSelectorProps) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const toggleRef = useRef<HTMLButtonElement>(null);

  function close() {
    setOpen(false);
    toggleRef.current?.focus();
  }

  const expanded = open && !disabled;

  return (
    <div
      className="mt-2"
      onKeyDown={(e) => {
        if (e.key === "Escape" && expanded) {
          e.stopPropagation();
          close();
        }
      }}
    >
      <button
        ref={toggleRef}
        type="button"
        aria-expanded={expanded}
        aria-controls={panelId}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={[
          "inline-flex min-h-[44px] max-w-full items-center gap-2 rounded-full border border-border bg-surface px-4 text-sm text-text-muted",
          "transition-colors duration-200 ease-[cubic-bezier(0.2,0,0,1)] hover:text-text",
          "disabled:cursor-not-allowed disabled:opacity-40",
          focusRing,
        ].join(" ")}
      >
        <span className="text-text-dim">Light</span>
        <span className="truncate text-text">{selectionSummary(condition, intent)}</span>
        <svg
          viewBox="0 0 24 24"
          width="14"
          height="14"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className={`flex-shrink-0 transition-transform duration-200 ease-[cubic-bezier(0.2,0,0,1)] ${expanded ? "rotate-180" : ""}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {expanded && (
        <div
          id={panelId}
          className="pw-expand-in mt-2 max-h-[40dvh] overflow-y-auto rounded-2xl border border-border bg-surface p-3"
        >
          <div role="radiogroup" aria-label="Light" onKeyDown={moveRadioFocus} className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                role="radio"
                aria-checked={condition === null}
                tabIndex={condition === null ? 0 : -1}
                onClick={() => onConditionChange(null)}
                className={chipClass(condition === null)}
              >
                {LET_IT_DECIDE_LABEL}
              </button>
            </div>
            {CONDITION_GROUPS.map((group) => (
              <div key={group.label} className="flex flex-col gap-2">
                <p aria-hidden="true" className="text-[11px] font-medium uppercase tracking-widest text-text-dim">
                  {group.label}
                </p>
                <div className="flex flex-wrap gap-2">
                  {group.options.map((option) => {
                    const selected = condition === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        aria-label={`${group.label}: ${option.label}`}
                        tabIndex={selected ? 0 : -1}
                        onClick={() => onConditionChange(option.value)}
                        className={chipClass(selected)}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <p aria-hidden="true" className="mb-2 mt-4 text-[11px] font-medium uppercase tracking-widest text-text-dim">
            Brightness
          </p>
          <div
            role="radiogroup"
            aria-label="Brightness"
            onKeyDown={moveRadioFocus}
            className="grid grid-cols-3 gap-1 rounded-xl border border-border bg-bg p-1"
          >
            {INTENT_OPTIONS.map((option) => {
              const selected = intent === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  aria-label={`${option.label}, ${option.stops}`}
                  tabIndex={selected ? 0 : -1}
                  onClick={() => onIntentChange(option.value)}
                  className={[
                    "flex min-h-[44px] flex-col items-center justify-center rounded-lg px-2 py-1 text-sm",
                    "transition-colors duration-200 ease-[cubic-bezier(0.2,0,0,1)]",
                    selected ? "bg-surface-3 text-text" : "text-text-muted hover:text-text",
                    focusRing,
                  ].join(" ")}
                >
                  <span>{option.label}</span>
                  <span className="text-xs text-text-dim">{option.stops}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
