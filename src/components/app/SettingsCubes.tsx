"use client";

import { useState, useEffect, type ReactNode, type KeyboardEvent } from "react";
import { useToastContext, copyToClipboard } from "@/components/app/useToast";
import { formatWhiteBalanceEnum, formatWbCopyValue } from "@/lib/settings";

// Every cube shares this min-height so the ISO cube's extra nudge-control
// row (see below) doesn't leave it taller than its row-mates in the grid.
const cubeMinHeightClass = "min-h-[196px]";

const cubeClass = [
  "flex flex-col gap-3 rounded-[14px] border border-accent bg-surface p-4 text-left",
  cubeMinHeightClass,
  "transition-colors duration-200 ease-[cubic-bezier(0.2,0,0,1)]",
  "hover:bg-surface-2 active:bg-surface-3",
  "cursor-pointer select-none",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-accent)]",
].join(" ");

const labelClass = "text-[11px] font-body font-medium uppercase tracking-widest text-text-muted";
const hintClass  = "text-[13px] font-body leading-[1.5] text-text-muted";

// STANDARD_ISOS mirrors calculate.ts's constant of the same name — a
// full-stop grid. Kept as a standalone copy (rather than an import) so this
// client bundle doesn't pull in calculator internals; keep in sync by hand
// if that grid ever changes.
const STANDARD_ISOS = [100, 200, 400, 800, 1600, 3200, 6400, 12800];

export const NUDGE_STOPS = [-1, 0, 1] as const;
export type NudgeStops = (typeof NUDGE_STOPS)[number];

// Local, network-free ±1 stop brightness nudge, applied to ISO only.
// STANDARD_ISOS is a full-stop grid and nudgeStops is a whole stop, so this
// is exact index arithmetic — no rounding, no geometric midpoint needed.
export function nudgedIso(baseIso: number, nudgeStops: NudgeStops): number {
  const i = STANDARD_ISOS.indexOf(baseIso);
  if (i === -1) return baseIso;
  return STANDARD_ISOS[Math.min(Math.max(i + nudgeStops, 0), STANDARD_ISOS.length - 1)];
}

function nudgeLabel(nudgeStops: NudgeStops): string {
  if (nudgeStops === 0) return "metered";
  const sign = nudgeStops > 0 ? "+" : "-";
  return `${sign}${Math.abs(nudgeStops)} stop`;
}

const nudgeBtnClass = [
  "flex h-11 w-11 items-center justify-center rounded-md text-text-muted",
  "transition-colors duration-150",
  "hover:bg-surface-2 hover:text-text",
  "disabled:opacity-30 disabled:pointer-events-none",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-accent)]",
].join(" ");

function isoHint(iso: number): string {
  if (iso <= 200)  return "Low ISO, clean files in bright light.";
  if (iso <= 800)  return "Moderate ISO for mixed or indoor light.";
  if (iso <= 3200) return "Raised ISO for dim scenes, expect some grain.";
  return "High ISO, usable, but noisiest.";
}

function apertureHint(aperture: string): string {
  const f = parseFloat(aperture.replace("f/", ""));
  if (f <= 2.0) return "Wide aperture, lots of light, shallow focus.";
  if (f <= 4.0) return "Mid-wide aperture, soft background, more light.";
  if (f <= 8.0) return "Mid aperture, deeper focus, less light.";
  return "Narrow aperture, deep focus; diffraction softens past f/16.";
}

function shutterHint(shutter_speed: string): string {
  if (shutter_speed.endsWith('"')) return "Long exposure, needs a tripod.";
  const denom = parseInt(shutter_speed.split("/")[1], 10);
  if (isNaN(denom)) return "Shutter speed set for this scene.";
  if (denom <= 100)  return "Slow shutter, steady hands or support help.";
  if (denom < 1000)  return "Fast enough to freeze everyday motion.";
  return "Very fast, freezes quick action.";
}

function wbHint(white_balance: string, wbLabel: string): string {
  if (white_balance === "auto")  return "Mixed lighting, let the camera handle this one.";
  if (white_balance === "flash") return "Flash-driven exposure, shutter set to sync speed.";
  return `Or set '${wbLabel}' preset on your camera.`;
}

function Cube({
  label,
  hint,
  children,
  onCopy,
}: {
  label: string;
  hint: string;
  children: ReactNode;
  onCopy: () => void;
}) {
  return (
    <button type="button" onClick={onCopy} className={cubeClass}>
      <span className={labelClass}>{label}</span>
      {/* flex-1 makes the value region absorb remaining height so all cubes
          in a grid row keep values vertically aligned across all WB states */}
      <div className="flex min-h-[52px] flex-1 items-center">{children}</div>
      <span className={hintClass}>{hint}</span>
    </button>
  );
}

function MinusIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

interface SettingsCubesProps {
  iso: number;
  aperture: string;
  shutter_speed: string;
  white_balance: string;
  color_temperature: string | null;
  nudgeStops: NudgeStops;
  onNudgeStopsChange: (next: NudgeStops) => void;
}

export default function SettingsCubes({
  iso,
  aperture,
  shutter_speed,
  white_balance,
  color_temperature,
  nudgeStops,
  onNudgeStopsChange,
}: SettingsCubesProps) {
  const showToast = useToastContext();
  const [enterDirection, setEnterDirection] = useState<"up" | "down" | null>(null);

  useEffect(() => {
    if (enterDirection === null) return;
    const raf = requestAnimationFrame(() => setEnterDirection(null));
    return () => cancelAnimationFrame(raf);
  }, [enterDirection, nudgeStops]);

  async function copy(value: string, toastLabel: string) {
    await copyToClipboard(value);
    showToast(`Copied ${toastLabel}`);
  }

  const shutterLong  = shutter_speed.endsWith('"');
  const shutterParts = shutterLong ? null : shutter_speed.split("/");

  // null-check is the layout gate — guards any future path where
  // white_balance !== "auto" but color_temperature is still null.
  const wbHasKelvin = color_temperature !== null;
  const wbLabel     = formatWhiteBalanceEnum(white_balance);
  const wbCopyValue = formatWbCopyValue(color_temperature, wbLabel);

  const adjustedIso = nudgedIso(iso, nudgeStops);
  const isoAdjusted = nudgeStops !== 0;
  const baseIndex = STANDARD_ISOS.indexOf(iso);
  const gridKnown = baseIndex !== -1;
  const minusDisabled = !gridKnown || nudgeStops <= NUDGE_STOPS[0] || baseIndex + nudgeStops <= 0;
  const plusDisabled =
    !gridKnown ||
    nudgeStops >= NUDGE_STOPS[NUDGE_STOPS.length - 1] ||
    baseIndex + nudgeStops >= STANDARD_ISOS.length - 1;

  function stepNudge(delta: 1 | -1) {
    const idx = NUDGE_STOPS.indexOf(nudgeStops);
    const nextIdx = idx + delta;
    if (nextIdx < 0 || nextIdx >= NUDGE_STOPS.length) return;
    onNudgeStopsChange(NUDGE_STOPS[nextIdx]);
    setEnterDirection(delta === 1 ? "up" : "down");
  }

  function copyIso() {
    copy(String(adjustedIso), String(adjustedIso));
  }

  // Arrow keys adjust whenever focus is anywhere inside the ISO cube
  // (the copy button or either nudge button) — keydown bubbles up to this
  // wrapper from whichever child currently has focus.
  function handleIsoWrapperKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "ArrowRight" && !plusDisabled) {
      e.preventDefault();
      stepNudge(1);
    } else if (e.key === "ArrowLeft" && !minusDisabled) {
      e.preventDefault();
      stepNudge(-1);
    }
  }

  const isoValueAnimClass =
    enterDirection === "up"
      ? "opacity-0 translate-y-[2px]"
      : enterDirection === "down"
        ? "opacity-0 -translate-y-[2px]"
        : "opacity-100 translate-y-0";

  const nudgeLabelClass = `font-mono text-[11px] leading-none ${
    isoAdjusted ? "text-[var(--accent)]" : "text-text-muted"
  }`;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4">

      {/* ISO — the only cube with a local brightness nudge; copies/announces
          the ADJUSTED value, not the base one. The copy target is a real
          <button> and the nudge row is its sibling (not nested inside it —
          a button can't contain other buttons), both wrapped in a plain div
          that owns the border/padding/min-height and the arrow-key handler. */}
      <div
        onKeyDown={handleIsoWrapperKeyDown}
        title={isoAdjusted ? `Adjusted from ISO ${iso}` : undefined}
        className={[
          "group flex flex-col gap-3 rounded-[14px] border border-accent bg-surface p-4 text-left",
          cubeMinHeightClass,
          isoAdjusted ? "ring-1 ring-[var(--accent)]" : "",
          "transition-colors duration-200 ease-[cubic-bezier(0.2,0,0,1)]",
          "hover:bg-surface-2 active:bg-surface-3",
        ].join(" ")}
      >
        <button
          type="button"
          onClick={copyIso}
          className="flex flex-1 flex-col gap-3 text-left cursor-pointer select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-accent)]"
        >
          <span className={labelClass}>ISO</span>
          <div className="flex min-h-[52px] flex-1 items-center">
            <span
              aria-live="polite"
              className={`font-mono text-[36px] leading-none text-text transition-all duration-[140ms] ease-out ${isoValueAnimClass}`}
            >
              {adjustedIso}
            </span>
          </div>
          <span className={hintClass}>{isoHint(adjustedIso)}</span>
        </button>

        {/* Bottom strip, sibling of the copy button: hover-revealed at
            desktop (md+), always visible below that. */}
        <div className="flex items-center justify-center gap-2 opacity-100 transition-opacity duration-150 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100">
          <button
            type="button"
            aria-label="one stop darker"
            disabled={minusDisabled}
            onClick={() => stepNudge(-1)}
            className={nudgeBtnClass}
          >
            <MinusIcon />
          </button>
          <span className={nudgeLabelClass}>{nudgeLabel(nudgeStops)}</span>
          <button
            type="button"
            aria-label="one stop brighter"
            disabled={plusDisabled}
            onClick={() => stepNudge(1)}
            className={nudgeBtnClass}
          >
            <PlusIcon />
          </button>
        </div>
      </div>

      {/* Aperture: "f/" slightly smaller + number large */}
      <Cube label="Aperture" hint={apertureHint(aperture)} onCopy={() => copy(aperture, aperture)}>
        <span className="font-mono text-[36px] leading-none text-text">
          <span className="text-[22px]">f/</span>{aperture.replace("f/", "")}
        </span>
      </Cube>

      {/* Shutter: ≥1s whole string; <1s "1/" small + denom large + "s" muted */}
      <Cube label="Shutter" hint={shutterHint(shutter_speed)} onCopy={() => copy(shutter_speed, shutter_speed)}>
        <span className="font-mono text-[36px] leading-none text-text">
          {shutterLong ? (
            shutter_speed
          ) : (
            <>
              <span className="text-[22px]">{shutterParts![0]}/</span>
              {shutterParts![1]}
              <span className="text-xs text-text-muted">s</span>
            </>
          )}
        </span>
      </Cube>

      {/* White Balance: null-safe — kelvin present → numeric; null → Auto (Fraunces) */}
      <Cube label="White Balance" hint={wbHint(white_balance, wbLabel)} onCopy={() => copy(wbCopyValue, wbCopyValue)}>
        {wbHasKelvin ? (
          <span className="font-mono text-[36px] leading-none text-text">
            {color_temperature}
            <span className="block text-xs text-text-muted">{wbLabel}</span>
          </span>
        ) : (
          <span className="font-display text-[28px] leading-none text-text">Auto</span>
        )}
      </Cube>

    </div>
  );
}
