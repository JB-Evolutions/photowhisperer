import type { Metadata } from "next";
import Link from "next/link";
import Logo from "@/components/shared/Logo";
import { NOINDEX } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Add to Home Screen · PhotoWhisperer",
  robots: NOINDEX,
};

const STEPS = [
  {
    title: "Tap the Share icon",
    detail:
      "In Safari's toolbar, tap the square with an arrow pointing up.",
  },
  {
    title: "Scroll down",
    detail: 'Find and tap "Add to Home Screen" in the share menu.',
  },
  {
    title: "Tap Add",
    detail: 'Confirm by tapping "Add" in the top right corner.',
  },
] as const;

function ShareIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="inline-block align-[-3px]"
    >
      <path d="M12 3v12" />
      <path d="M8 7l4-4 4 4" />
      <rect x="5" y="10" width="14" height="10" rx="2" />
    </svg>
  );
}

export default function InstallPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-12">
      <div className="flex w-full max-w-[440px] flex-col items-center gap-6 rounded-[24px] border border-border bg-surface px-8 py-10 text-center">
        <Logo />

        <div className="flex flex-col gap-1">
          <h1 className="font-display text-2xl text-text">
            Add PhotoWhisperer to your phone
          </h1>
          <p className="text-sm text-text-muted">
            Get quick access from your home screen, no app store needed.
          </p>
        </div>

        <ol className="flex w-full flex-col gap-3 text-left">
          {STEPS.map((step, i) => (
            <li
              key={step.title}
              className="flex gap-3 rounded-lg border border-border p-4"
            >
              <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-accent font-mono text-xs font-medium text-[var(--tile-text-on-accent)]">
                {i + 1}
              </span>
              <div>
                <p className="text-sm font-medium text-text">
                  {i === 0 ? (
                    <>
                      Tap the <ShareIcon /> Share icon
                    </>
                  ) : (
                    step.title
                  )}
                </p>
                <p className="text-sm text-text-muted">{step.detail}</p>
              </div>
            </li>
          ))}
        </ol>

        <Link
          href="/app"
          className="text-sm text-text-dim underline-offset-2 hover:text-text-muted hover:underline"
        >
          ← Back to app
        </Link>
      </div>
    </main>
  );
}
