// Marketing static replica of the in-app AI response shape (4 cubes + 3
// panels), per screen-spec-v1.md §1.1 and §4.5. This is NOT the real
// component — that's SettingsCubes.tsx / ResponsePanels.tsx per
// arch-spec-v3.1.md §8, built in Phase 9.6. This file exists only so the
// landing page can show visitors a faithful, on-brand preview of what
// they're buying before that component exists.

import type { ReactNode } from "react";

const STEPS = [
  {
    title: "Describe the scene",
    body: "Tell us the light, the subject, and how it's moving — in your own words.",
  },
  {
    title: "Read the settings",
    body: "Get ISO, aperture, shutter speed, and white balance, explained in plain English.",
  },
  {
    title: "Dial them in",
    body: "Set your camera and shoot — no exposure math required.",
  },
];

function InfoIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 16v-4M12 8h.01" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function WarningIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 9v4M12 17h.01" />
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
    </svg>
  );
}

function Cube({
  label,
  value,
  hint,
}: {
  label: string;
  value: ReactNode;
  hint: string;
}) {
  return (
    <div className="flex flex-col rounded-[14px] border border-border-accent p-4">
      <span className="font-body text-[11px] uppercase tracking-[0.08em] text-text-dim">
        {label}
      </span>
      <span className="mt-2 font-mono text-3xl text-text">{value}</span>
      <p className="mt-2 text-[13px] leading-[1.5] text-text-muted">{hint}</p>
    </div>
  );
}

function Panel({
  icon,
  label,
  tone = "neutral",
  children,
}: {
  icon: ReactNode;
  label: string;
  tone?: "neutral" | "warning";
  children: ReactNode;
}) {
  return (
    <div
      className={`rounded-[14px] border bg-surface p-5 ${
        tone === "warning" ? "border-warning/40" : "border-border"
      }`}
    >
      <div className="flex items-center gap-2 text-xs uppercase tracking-[0.08em] text-text-dim">
        {icon}
        {label}
      </div>
      <p className="mt-2 text-[15px] leading-[1.5] text-text-muted">{children}</p>
    </div>
  );
}

export default function AppShowcase() {
  return (
    <section className="py-24">
      <div className="mx-auto max-w-[1280px] px-8">
        <ol className="grid grid-cols-1 gap-8 sm:grid-cols-3">
          {STEPS.map((step, index) => (
            <li key={step.title} className="flex gap-4">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border-accent font-mono text-sm text-accent">
                {index + 1}
              </span>
              <div>
                <h3 className="font-display text-xl text-text">{step.title}</h3>
                <p className="mt-1 text-sm text-text-muted">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className="pw-hero-visual mt-16 rounded-2xl border border-border bg-surface p-6 sm:p-10">
          <div className="flex items-center gap-2 text-xs text-text-dim">
            <span className="h-2 w-2 rounded-full bg-accent" />
            <span className="font-mono">PhotoWhisperer · settings ready</span>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Cube
              label="ISO"
              value="400"
              hint="A touch higher to compensate for the warm, lower-angle light."
            />
            <Cube
              label="Aperture"
              value="f/2.0"
              hint="Wide enough to blur the background, tight enough to keep both eyes sharp."
            />
            <Cube
              label="Shutter"
              value="1/250"
              hint="Fast enough to freeze light movement without a tripod."
            />
            <Cube
              label="White Balance"
              value={
                <>
                  5500K
                  <span className="mt-0.5 block font-body text-xs text-text-dim">
                    Cloudy
                  </span>
                </>
              }
              hint="Or set 'Cloudy' preset on your camera."
            />
          </div>

          <div className="mt-4 flex flex-col gap-3">
            <Panel icon={<InfoIcon />} label="Scene summary">
              Backlit portrait at golden hour with light subject movement. These
              settings keep skin tones warm and your subject sharp without blowing
              out the highlights behind them.
            </Panel>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Panel icon={<CheckIcon />} label="Assumptions">
                Handheld, no tripod · 50mm focal length assumed
              </Panel>
              <Panel icon={<WarningIcon />} label="Warnings" tone="warning">
                Wide aperture means a thin depth of field — focus carefully on the
                eyes, especially with subject movement
              </Panel>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
