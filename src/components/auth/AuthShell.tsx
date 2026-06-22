import type { ReactNode } from "react";

const QUOTES = [
  "Got the bird-in-flight shot on the first try",
  "Saved me re-reading my exposure book — again",
];

export default function AuthShell({ children }: { children: ReactNode }) {
  const quote = QUOTES[Math.floor(Math.random() * QUOTES.length)];

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-12">
      <div className="grid w-full max-w-[920px] grid-cols-1 lg:grid-cols-2 lg:overflow-hidden lg:rounded-[24px] lg:border lg:border-border lg:bg-surface">
        <div className="flex w-full items-center justify-center py-8 lg:px-10 lg:py-14">
          {children}
        </div>
        <div className="hidden flex-col items-center justify-center border-l border-border bg-surface-2 px-10 py-14 lg:flex">
          <p className="max-w-[280px] text-center font-display text-xl italic leading-relaxed text-text-muted">
            &ldquo;{quote}&rdquo;
          </p>
        </div>
      </div>
    </main>
  );
}
