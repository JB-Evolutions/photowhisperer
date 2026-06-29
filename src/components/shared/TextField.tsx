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
  multiline?: boolean;
  rows?: number;
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
  multiline = false,
  rows = 4,
}: TextFieldProps) {
  const errorId = `${id}-error`;
  const helpId = `${id}-help`;

  const describedBy =
    [helpText ? helpId : "", error ? errorId : ""].filter(Boolean).join(" ") ||
    undefined;

  const sharedClass = [
    "rounded-[10px] border bg-surface px-4 text-base text-text outline-none transition-colors focus:border-accent",
    error ? "border-danger" : "border-border-strong",
    disabled || readOnly ? "cursor-not-allowed opacity-60" : "",
  ].join(" ");

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-text-muted">
        {label}
      </label>
      {multiline ? (
        <textarea
          id={id}
          name={id}
          value={value}
          onChange={onChange ? (e) => onChange(e.target.value) : undefined}
          readOnly={readOnly}
          disabled={disabled}
          placeholder={placeholder}
          rows={rows}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={`${sharedClass} min-h-[52px] resize-y py-3`}
        />
      ) : (
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
          className={`${sharedClass} min-h-[52px]`}
        />
      )}
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
