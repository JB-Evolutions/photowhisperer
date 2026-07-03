import { parseDbTimestamp } from "@/lib/date";

export const GRACE_PERIOD_DAYS = 7;

export function isWithinGracePeriod(deletedAt: string): boolean {
  return Date.now() - parseDbTimestamp(deletedAt).getTime() < GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000;
}
