"use client";

// Light-condition picker, paired with the brightness stepper in the row above
// the composer. Never a mandatory step: "Let it decide" is the default, and the
// choice rides on every request for the rest of the session.
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import type { BrightnessIntent, LightCondition } from "@/lib/contract/types";
import {
  CONDITION_GROUPS,
  LET_IT_DECIDE_LABEL,
  selectionSummary,
} from "@/components/app/conditions";

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-accent)]";

function chipClass(selected: boolean) {
  return [
    "pw-pressable inline-flex min-h-[44px] items-center rounded-full border px-4 text-sm",
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
  // Read-only here — the stepper owns changing it; the collapsed pill just
  // summarises both axes.
  intent: BrightnessIntent;
  onConditionChange: (condition: LightCondition | null) => void;
  disabled?: boolean;
}

export default function ConditionSelector({
  condition,
  intent,
  onConditionChange,
  disabled = false,
}: ConditionSelectorProps) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const toggleRef = useRef<HTMLButtonElement>(null);

  // Distance from the viewport's bottom edge to the trigger's top edge. The
  // panel is positioned against the viewport (see the panel comment below), so
  // this is the one number that still has to come from the trigger to keep it
  // opening upward out of the pill.
  const [panelBottom, setPanelBottom] = useState(0);

  function measure() {
    const rect = toggleRef.current?.getBoundingClientRect();
    if (rect) setPanelBottom(window.innerHeight - rect.top);
  }

  function close() {
    setOpen(false);
    toggleRef.current?.focus();
  }

  const expanded = open && !disabled;

  // Measured again on open so the first paint is already in the right place,
  // and kept there while open: the composer grows as the textarea does, and on
  // mobile the whole row moves when the keyboard opens.
  useEffect(() => {
    if (!expanded) return;
    measure();
    const onViewportChange = () => measure();
    window.addEventListener("resize", onViewportChange);
    window.addEventListener("scroll", onViewportChange, true);
    return () => {
      window.removeEventListener("resize", onViewportChange);
      window.removeEventListener("scroll", onViewportChange, true);
    };
  }, [expanded]);

  return (
    <div
      className="min-w-0"
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
        onClick={() => {
          if (!open) measure();
          setOpen((o) => !o);
        }}
        className={[
          "pw-pressable inline-flex min-h-[44px] w-full max-w-[18rem] items-center gap-2 rounded-full border border-border bg-surface px-4 text-sm text-text-muted",
          "transition-colors duration-200 ease-[cubic-bezier(0.2,0,0,1)] hover:text-text",
          "disabled:cursor-not-allowed disabled:opacity-40",
          focusRing,
        ].join(" ")}
      >
        <span className="flex-none text-text-dim">Light</span>
        <span className="min-w-0 flex-1 truncate text-left text-text">
          {selectionSummary(condition, intent)}
        </span>
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

      {/* Anchored above the control row rather than in flow: as a flex item the
          panel would otherwise size to max-content (every chip on one line) and
          blow the row out. Opening upward keeps it clear of the composer, the
          same way PhotoPicker's sheet sits on desktop. Width is set here, not
          by the trigger, so the chips wrap exactly as they always have.

          Positioned against the viewport, not the pill. min(92vw,30rem) is a
          viewport measurement — it means "full width bar a 4vw gutter each
          side, capped at 30rem" — and that only holds if the box it centres in
          is the viewport. Anchored to the pill instead, inset-x-0 + mx-auto had
          a ~345px panel to centre in a ~183px wrapper; over-constrained, the
          auto margins collapse to zero, and it left-aligned off the right edge.
          Only `bottom` still comes from the trigger, so the upward anchor is
          unchanged. Centring is left to mx-auto rather than a translate, which
          pw-expand-in animates. */}
      {expanded && (
        <div
          id={panelId}
          style={{ bottom: panelBottom }}
          className="pw-expand-in fixed inset-x-0 z-40 mx-auto mb-2 max-h-[40dvh] w-[min(92vw,30rem)] overflow-y-auto rounded-2xl border border-border bg-surface p-3"
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
        </div>
      )}
    </div>
  );
}
