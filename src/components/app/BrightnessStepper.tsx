"use client";

// Brightness as a three-stop stepper: Moody (−1) · Natural (0) · Bright (+1).
// One tab stop for the whole control (WAI-ARIA spinbutton) with aria-valuetext
// carrying the label; the chevrons are pointer targets kept out of the tab
// order, so Left/Right on the control is the only keyboard path.
import type { KeyboardEvent } from "react";
import { INTENT_STOPS, type BrightnessIntent } from "@/lib/contract/types";
import {
  INTENT_ORDER,
  canStepIntent,
  intentStepperLabel,
  stepIntent,
} from "@/components/app/conditions";

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-accent)]";

const FIRST = INTENT_ORDER[0];
const LAST = INTENT_ORDER[INTENT_ORDER.length - 1];

function Chevron({ direction }: { direction: -1 | 1 }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points={direction === -1 ? "15 18 9 12 15 6" : "9 18 15 12 9 6"} />
    </svg>
  );
}

interface BrightnessStepperProps {
  intent: BrightnessIntent;
  onChange: (intent: BrightnessIntent) => void;
  // Set while a request is in flight, out of credits, or rate limited.
  disabled?: boolean;
}

export default function BrightnessStepper({
  intent,
  onChange,
  disabled = false,
}: BrightnessStepperProps) {
  function step(delta: -1 | 1) {
    if (disabled) return;
    const next = stepIntent(intent, delta);
    if (next !== intent) onChange(next);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (disabled) return;
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    step(e.key === "ArrowLeft" ? -1 : 1);
  }

  function chevronClass(delta: -1 | 1) {
    // When the whole control is disabled the wrapper already dims everything —
    // adding per-button opacity on top would compound to near-invisible.
    const atEnd = !canStepIntent(intent, delta);
    return [
      "flex h-11 w-11 flex-none items-center justify-center rounded-full text-text-muted",
      "transition-colors duration-200 ease-[cubic-bezier(0.2,0,0,1)]",
      focusRing,
      disabled
        ? "cursor-not-allowed"
        : atEnd
          ? "cursor-not-allowed opacity-30"
          : "hover:bg-surface-2 hover:text-text",
    ].join(" ");
  }

  const label = intentStepperLabel(intent);

  return (
    <div
      role="spinbutton"
      tabIndex={disabled ? -1 : 0}
      aria-label="Brightness"
      aria-valuenow={INTENT_STOPS[intent]}
      aria-valuemin={INTENT_STOPS[FIRST]}
      aria-valuemax={INTENT_STOPS[LAST]}
      aria-valuetext={label}
      aria-disabled={disabled || undefined}
      onKeyDown={handleKeyDown}
      className={[
        "inline-flex flex-none items-center rounded-full border border-border bg-surface",
        "transition-colors duration-200 ease-[cubic-bezier(0.2,0,0,1)]",
        disabled ? "cursor-not-allowed opacity-40" : "",
        focusRing,
      ].join(" ")}
    >
      <button
        type="button"
        tabIndex={-1}
        aria-label="Less bright"
        disabled={disabled || !canStepIntent(intent, -1)}
        onClick={() => step(-1)}
        className={chevronClass(-1)}
      >
        <Chevron direction={-1} />
      </button>

      {/* aria-hidden: aria-valuetext above already announces this label, so the
          text is presentational here. Every label is rendered invisibly in the
          same grid cell, fixing the box to the widest of the three so the row
          never reflows as the word changes. */}
      <span aria-hidden="true" className="grid px-1 text-sm text-text">
        {INTENT_ORDER.map((option) => (
          <span
            key={`sizer-${option}`}
            className="invisible col-start-1 row-start-1 whitespace-nowrap text-center"
          >
            {intentStepperLabel(option)}
          </span>
        ))}
        <span
          key={`live-${intent}`}
          className="pw-intent-fade col-start-1 row-start-1 whitespace-nowrap text-center"
        >
          {label}
        </span>
      </span>

      <button
        type="button"
        tabIndex={-1}
        aria-label="Brighter"
        disabled={disabled || !canStepIntent(intent, 1)}
        onClick={() => step(1)}
        className={chevronClass(1)}
      >
        <Chevron direction={1} />
      </button>
    </div>
  );
}
