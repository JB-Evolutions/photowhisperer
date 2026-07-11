"use client";

import type { ReactNode } from "react";
import { useToastContext, copyToClipboard } from "@/components/app/useToast";
import { formatWhiteBalanceEnum, formatWbCopyValue } from "@/lib/settings";

const cubeClass = [
  "flex flex-col gap-3 rounded-[14px] border border-accent bg-surface p-4 text-left",
  "transition-colors duration-200 ease-[cubic-bezier(0.2,0,0,1)]",
  "hover:bg-surface-2 active:bg-surface-3",
  "cursor-pointer select-none",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-accent)]",
].join(" ");

const labelClass = "text-[11px] font-body font-medium uppercase tracking-widest text-text-muted";
const hintClass  = "text-[13px] font-body leading-[1.5] text-text-muted";

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

interface SettingsCubesProps {
  iso: number;
  aperture: string;
  shutter_speed: string;
  white_balance: string;
  color_temperature: string | null;
}

export default function SettingsCubes({
  iso,
  aperture,
  shutter_speed,
  white_balance,
  color_temperature,
}: SettingsCubesProps) {
  const showToast = useToastContext();

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

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4">

      {/* ISO — toast shows bare value "400", not "ISO 400" */}
      <Cube label="ISO" hint={isoHint(iso)} onCopy={() => copy(String(iso), String(iso))}>
        <span className="font-mono text-[36px] leading-none text-text">{iso}</span>
      </Cube>

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
