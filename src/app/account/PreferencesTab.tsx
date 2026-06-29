"use client";

import ThemeToggle from "@/components/shared/ThemeToggle";

function ComingSoonTooltip({ id, text }: { id: string; text: string }) {
  return (
    <div
      id={id}
      role="tooltip"
      className="pointer-events-none absolute left-0 top-full z-10 mt-1.5 hidden whitespace-nowrap rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-xs text-text-muted shadow-sm group-focus-within:block group-hover:block"
    >
      {text}
    </div>
  );
}

export default function PreferencesTab() {
  return (
    <div className="flex max-w-lg flex-col gap-8 px-6 py-8">
      <h2 className="font-display text-base text-text">Preferences</h2>

      {/* Appearance — ThemeToggle self-manages; no save/discard wiring needed */}
      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-medium text-text">Appearance</span>
            <span className="text-sm text-text-dim">Saved to this browser.</span>
          </div>
          <ThemeToggle />
        </div>
      </section>

      {/* Deferred rows — §5.1 surface present but not-yet-active (9.9b).
          Uses `disabled` to match Profile tab's coming-soon pattern.
          NOTE: disabled drops these from tab order; tooltip is invisible to
          keyboard/SR users. Tracked for 9.13 polish alongside Profile's
          "Edit email" and "Manage billing" buttons (same issue). */}
      <section className="flex flex-col gap-4 border-t border-border pt-6">
        <p className="text-xs font-medium uppercase tracking-wide text-text-dim">Coming in a future update</p>

        {/* Default focal length */}
        <div className="flex items-center justify-between gap-4 opacity-50">
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-medium text-text">Default focal length</span>
            <span className="text-sm text-text-dim">Applied when no focal cue is in your prompt.</span>
          </div>
          <div className="group relative">
            <button
              type="button"
              disabled
              aria-describedby="focal-length-tooltip"
              className="cursor-not-allowed rounded-[10px] border border-border-strong bg-surface px-4 py-2 text-sm text-text-muted"
            >
              Not set
            </button>
            <ComingSoonTooltip id="focal-length-tooltip" text="Default focal length coming soon" />
          </div>
        </div>

        {/* Email notifications */}
        <div className="flex items-center justify-between gap-4 opacity-50">
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-medium text-text">Product emails</span>
            <span className="text-sm text-text-dim">Tips, feature updates, and announcements.</span>
          </div>
          <div className="group relative">
            <button
              type="button"
              disabled
              aria-describedby="email-opt-in-tooltip"
              className="cursor-not-allowed rounded-[10px] border border-border-strong bg-surface px-4 py-2 text-sm text-text-muted"
            >
              Not set
            </button>
            <ComingSoonTooltip id="email-opt-in-tooltip" text="Email preferences coming soon" />
          </div>
        </div>
      </section>
    </div>
  );
}
