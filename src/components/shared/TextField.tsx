import type { ReactNode } from "react";

interface TextFieldProps {
  id: string;
  label: string;
  value: string;
  onChange?: (value: string) => void;
  type?: string;
  error?: string;
  helpText?: ReactNode;
  disabled?: boolean;
  readOnly?: boolean;
  placeholder?: string;
  autoComplete?: string;
}

export default function TextField({
  id,
  label,
  value,
  onChange,
  type = "text",
  error,
  helpText,
  disabled = false,
  readOnly = false,
  placeholder,
  autoComplete,
}: TextFieldProps) {
  const errorId = `${id}-error`;
  const helpId = `${id}-help`;

  const describedBy =
    [helpText ? helpId : "", error ? errorId : ""].filter(Boolean).join(" ") ||
    undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-text-muted">
        {label}
      </label>
      <input
        id={id}
        name={id}
        type={type}
        value={value}
        onChange={onChange ? (e) => onChange(e.target.value) : undefined}
        readOnly={readOnly}
        disabled={disabled}
        placeholder={placeholder}
        autoComplete={autoComplete}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={[
          "min-h-[52px] rounded-[10px] border bg-surface px-4 text-base text-text outline-none transition-colors focus:border-accent",
          error ? "border-danger" : "border-border-strong",
          disabled || readOnly ? "cursor-not-allowed opacity-60" : "",
        ].join(" ")}
      />
      {helpText && (
        <p id={helpId} className="text-sm text-text-dim">
          {helpText}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
