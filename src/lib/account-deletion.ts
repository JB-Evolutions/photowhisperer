export const GRACE_PERIOD_DAYS = 7;

export function isWithinGracePeriod(deletedAt: string): boolean {
  return Date.now() - new Date(deletedAt).getTime() < GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000;
}
