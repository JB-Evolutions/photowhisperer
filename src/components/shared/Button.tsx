import Link from "next/link";
import type { ReactNode } from "react";

type Variant = "primary" | "outline" | "ghost";
type Size = "default" | "lg";

interface ButtonProps {
  href: string;
  variant?: Variant;
  size?: Size;
  className?: string;
  children: ReactNode;
}

const base =
  "inline-flex items-center gap-2 whitespace-nowrap rounded-[10px] font-body font-medium text-sm tracking-[0.01em] transition-all duration-[250ms] ease-[cubic-bezier(0.2,0,0,1)] border border-transparent";

const variants: Record<Variant, string> = {
  primary:
    "pw-btn-primary text-[var(--tile-text-on-accent)] bg-gradient-to-br from-accent to-accent-2 hover:-translate-y-px",
  outline:
    "text-text bg-transparent border-border-strong hover:border-text-muted hover:bg-surface",
  ghost: "text-text-muted bg-transparent hover:text-text hover:bg-surface",
};

const sizes: Record<Size, string> = {
  default: "px-5 py-2.5",
  lg: "px-7 py-3.5 text-[15px] rounded-xl",
};

export default function Button({
  href,
  variant = "primary",
  size = "default",
  className = "",
  children,
}: ButtonProps) {
  return (
    <Link
      href={href}
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
    >
      {children}
    </Link>
  );
}
