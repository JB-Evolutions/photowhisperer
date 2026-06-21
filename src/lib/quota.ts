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
