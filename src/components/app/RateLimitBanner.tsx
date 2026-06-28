"use client";

interface RateLimitBannerProps {
  cooldown: number;
}

export default function RateLimitBanner({ cooldown }: RateLimitBannerProps) {
  return (
    <div className="mx-4 mb-2 flex items-center rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-text-muted">
      <p>Easy — give us {cooldown} second{cooldown !== 1 ? "s" : ""}…</p>
    </div>
  );
}
