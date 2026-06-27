"use client";

import Button from "@/components/shared/Button";
import { useToastContext, copyToClipboard } from "@/components/app/useToast";
import { formatWhiteBalanceEnum, formatWbCopyValue } from "@/lib/settings";

const thumbClass = [
  "flex h-9 w-9 items-center justify-center rounded-lg text-text-muted",
  "transition-colors duration-200 ease-[cubic-bezier(0.2,0,0,1)]",
  "hover:bg-surface-2 hover:text-text",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-accent)]",
].join(" ");

const btnFocusClass =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-accent)]";

interface ResponseActionsProps {
  iso: number;
  aperture: string;
  shutter_speed: string;
  white_balance: string;
  color_temperature: string | null;
  onRefine?: () => void;
  onFeedback?: (rating: "up" | "down") => void;
}

export default function ResponseActions({
  iso,
  aperture,
  shutter_speed,
  white_balance,
  color_temperature,
  onRefine,
  onFeedback,
}: ResponseActionsProps) {
  const showToast = useToastContext();

  const wbLabel     = formatWhiteBalanceEnum(white_balance);
  const wbSegment   = formatWbCopyValue(color_temperature, wbLabel);
  const copyAllText = `ISO ${iso} · ${aperture} · ${shutter_speed} · ${wbSegment}`;

  async function handleCopyAll() {
    await copyToClipboard(copyAllText);
    showToast("Copied to clipboard");
  }

  return (
    <div className="flex flex-col gap-2 md:flex-row md:items-center">
      <Button
        variant="outline"
        fullWidth
        className={`md:w-auto ${btnFocusClass}`}
        onClick={onRefine}
      >
        Refine
      </Button>
      <Button
        variant="outline"
        fullWidth
        className={`md:w-auto ${btnFocusClass}`}
        onClick={handleCopyAll}
      >
        Copy all
      </Button>

      <div className="flex gap-1 md:ml-auto">
        <button
          type="button"
          aria-label="Helpful"
          className={thumbClass}
          onClick={() => onFeedback?.("up")}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z" />
            <path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
          </svg>
        </button>
        <button
          type="button"
          aria-label="Not helpful"
          className={thumbClass}
          onClick={() => onFeedback?.("down")}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3H10z" />
            <path d="M17 2h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17" />
          </svg>
        </button>
      </div>
    </div>
  );
}
