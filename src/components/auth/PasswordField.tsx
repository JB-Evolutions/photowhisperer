"use client";

import { useState } from "react";
import { getPasswordStrength } from "@/lib/auth-validation";

interface PasswordFieldProps {
  id?: string;
  label?: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  autoComplete?: string;
  showStrengthMeter?: boolean;
  error?: string;
}

function EyeIcon({ revealed }: { revealed: boolean }) {
  if (revealed) {
    return (
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M3 3l18 18" />
        <path d="M10.58 10.58a2 2 0 0 0 2.83 2.83" />
        <path d="M9.88 4.24A9.12 9.12 0 0 1 12 4c5 0 8.5 4 10 8-.43 1.1-1 2.16-1.68 3.13M6.61 6.61C4.5 8.06 2.93 10.1 2 12c1.5 4 5 8 10 8 1.26 0 2.44-.26 3.5-.73" />
      </svg>
    );
  }
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2 12s3.5-8 10-8 10 8 10 8-3.5 8-10 8-10-8-10-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

const SEGMENT_COLORS = ["bg-danger", "bg-warning", "bg-accent"];
const STRENGTH_LABELS: Record<number, string> = { 1: "weak", 2: "fair", 3: "strong" };

export default function PasswordField({
  id = "password",
  label = "Password",
  value,
  onChange,
  onBlur,
  autoComplete = "new-password",
  showStrengthMeter = false,
  error,
}: PasswordFieldProps) {
  const [revealed, setRevealed] = useState(false);
  const { score, meetsMinimum } = getPasswordStrength(value);
  const showMinLengthError = showStrengthMeter && value.length > 0 && !meetsMinimum;
  const hasError = showMinLengthError || Boolean(error);
  const errorId = `${id}-error`;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-text-muted">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          name={id}
          type={revealed ? "text" : "password"}
          autoComplete={autoComplete}
          required
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onBlur={onBlur}
          aria-invalid={hasError || undefined}
          aria-describedby={hasError ? errorId : undefined}
          className={`min-h-[52px] w-full rounded-[10px] border bg-surface px-4 pr-12 text-base text-text outline-none transition-colors focus:border-accent ${
            hasError ? "border-danger" : "border-border-strong"
          }`}
        />
        <button
          type="button"
          onClick={() => setRevealed((current) => !current)}
          aria-label={revealed ? "Hide password" : "Show password"}
          className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-text-dim transition-colors hover:text-text"
        >
          <EyeIcon revealed={revealed} />
        </button>
      </div>

      {showStrengthMeter && (
        <>
          {value.length > 0 && (
            <div className="flex gap-1.5" aria-hidden="true">
              {[1, 2, 3].map((segment) => (
                <span
                  key={segment}
                  className={`h-1.5 flex-1 rounded-full transition-colors ${
                    segment <= score ? SEGMENT_COLORS[score - 1] : "bg-border"
                  }`}
                />
              ))}
            </div>
          )}
          <span className="sr-only" aria-live="polite">
            {score > 0 ? `Password strength: ${STRENGTH_LABELS[score]}` : ""}
          </span>
        </>
      )}

      {hasError && (
        <p id={errorId} className="text-sm text-danger">
          {error ?? "Must be at least 8 characters"}
        </p>
      )}
    </div>
  );
}
