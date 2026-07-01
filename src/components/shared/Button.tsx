import { forwardRef } from "react";
import Link from "next/link";
import type { MouseEvent, ReactNode } from "react";

type Variant = "primary" | "outline" | "ghost";
type Size = "default" | "lg";

interface ButtonProps {
  href?: string;
  type?: "button" | "submit" | "reset";
  variant?: Variant;
  size?: Size;
  className?: string;
  fullWidth?: boolean;
  pending?: boolean;
  pendingLabel?: ReactNode;
  disabled?: boolean;
  onClick?: (event: MouseEvent) => void;
  children: ReactNode;
}

export const buttonBase =
  "inline-flex items-center gap-2 whitespace-nowrap rounded-[10px] font-body font-medium text-sm tracking-[0.01em] transition-all duration-[250ms] ease-[cubic-bezier(0.2,0,0,1)] border";

export const buttonVariants: Record<Variant, string> = {
  primary:
    "pw-btn-primary text-[var(--tile-text-on-accent)] bg-gradient-to-br from-accent to-accent-2 border-transparent hover:-translate-y-px",
  outline:
    "text-text bg-transparent border-border-strong hover:border-text-muted hover:bg-surface",
  ghost: "text-text-muted bg-transparent border-transparent hover:text-text hover:bg-surface",
};

export const buttonSizes: Record<Size, string> = {
  default: "px-5 py-2.5",
  lg: "px-7 py-3.5 text-[15px] rounded-xl",
};

function Spinner() {
  return (
    <svg className="h-[1em] w-[1em] animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="3"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M12 2a10 10 0 0 1 10 10h-3a7 7 0 0 0-7-7V2z"
      />
    </svg>
  );
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({
  href,
  type = "button",
  variant = "primary",
  size = "default",
  className = "",
  fullWidth = false,
  pending = false,
  pendingLabel,
  disabled = false,
  onClick,
  children,
}: ButtonProps, ref) {
  const isBlocked = disabled || pending;
  const classes = `${buttonBase} ${buttonVariants[variant]} ${buttonSizes[size]} ${
    fullWidth ? "w-full justify-center" : ""
  } ${className} relative`;

  const content = (
    <>
      <span className={pending ? "invisible flex items-center gap-2" : "flex items-center gap-2"}>
        {children}
      </span>
      {pending && (
        <span
          className="absolute inset-0 flex items-center justify-center gap-2"
          aria-live="polite"
        >
          <Spinner />
          {pendingLabel}
        </span>
      )}
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        aria-disabled={isBlocked || undefined}
        aria-busy={pending || undefined}
        onClick={isBlocked ? (event) => event.preventDefault() : onClick}
        className={`${classes} ${isBlocked ? "pointer-events-none opacity-60" : ""}`}
      >
        {content}
      </Link>
    );
  }

  return (
    <button
      ref={ref}
      type={type}
      onClick={onClick}
      disabled={isBlocked}
      aria-busy={pending}
      className={`${classes} disabled:cursor-not-allowed disabled:opacity-60`}
    >
      {content}
    </button>
  );
});

export default Button;
