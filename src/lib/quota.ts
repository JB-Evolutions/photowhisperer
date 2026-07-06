// Per arch-spec-v3.1.md §3

export const TIER_LIMITS = {
  snapshot: 5,
  portrait: 500,
  studio: 2000, // hard cap; extra credits extend beyond
} as const;

export type Tier = keyof typeof TIER_LIMITS;

export const TIER_DISPLAY_NAMES: Record<Tier, string> = {
  snapshot: "Snapshot",
  portrait: "Portrait",
  studio: "Studio",
};

export const TIER_PRICES_USD: Record<Tier, number> = {
  snapshot: 0,
  portrait: 14,
  studio: 39,
};

export const TIER_HISTORY_LIMITS: Record<Tier, number> = {
  snapshot: 3,
  portrait: -1,
  studio: -1,
};

export const SOFT_WARNING_THRESHOLD = 0.8; // 80% of monthly limit

export function getTierLimit(tier: string): number {
  return TIER_LIMITS[tier as Tier] ?? TIER_LIMITS.snapshot;
}

export function getHistoryLimit(tier: string): number {
  return TIER_HISTORY_LIMITS[tier as Tier] ?? 3;
}

// Returns the UTC month (1-12) and year for quota keying. Computed from UTC to
// ensure quota periods are timezone-invariant — a server or dev machine in
// UTC+13 must not roll into the next quota month before UTC midnight.
export function utcQuotaPeriod(now = new Date()): { quotaMonth: number; quotaYear: number } {
  return { quotaMonth: now.getUTCMonth() + 1, quotaYear: now.getUTCFullYear() };
}

export function nextResetDate(now = new Date()): string {
  const { quotaMonth, quotaYear } = utcQuotaPeriod(now);
  // quotaMonth is 1-based. Convert back to 0-based, then advance by one month
  // so Date.UTC lands on the first day of the next quota period. Month=12
  // (December) correctly overflows to January of quotaYear+1 via Date.UTC.
  const zeroBasedMonth = quotaMonth - 1;
  const d = new Date(Date.UTC(quotaYear, zeroBasedMonth + 1, 1));
  return d.toLocaleDateString("en-GB", { month: "long", day: "numeric", year: "numeric" });
}

// TODO(Phase 10): replace with real retry_after from Upstash 429.
export const RATE_LIMIT_COOLDOWN_SECONDS = 20;
