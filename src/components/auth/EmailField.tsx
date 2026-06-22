"use client";

import { useState } from "react";
import { isValidEmail } from "@/lib/auth-validation";

interface EmailFieldProps {
  id?: string;
  label?: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete?: string;
  required?: boolean;
}

export default function EmailField({
  id = "email",
  label = "Email",
  value,
  onChange,
  autoComplete = "email",
  required = true,
}: EmailFieldProps) {
  const [touched, setTouched] = useState(false);
  const showError = touched && value.length > 0 && !isValidEmail(value);
  const errorId = `${id}-error`;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-text-muted">
        {label}
      </label>
      <input
        id={id}
        name={id}
        type="email"
        autoComplete={autoComplete}
        required={required}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={() => setTouched(true)}
        aria-invalid={showError || undefined}
        aria-describedby={showError ? errorId : undefined}
        className={`min-h-[52px] rounded-[10px] border bg-surface px-4 text-base text-text outline-none transition-colors focus:border-accent ${
          showError ? "border-danger" : "border-border-strong"
        }`}
      />
      {showError && (
        <p id={errorId} className="text-sm text-danger">
          Enter a valid email address.
        </p>
      )}
    </div>
  );
}
