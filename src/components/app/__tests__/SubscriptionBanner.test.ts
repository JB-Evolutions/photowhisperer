import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { getBannerState } from "../SubscriptionBanner";

const PAST_Z = "2020-01-01T00:00:00Z";  // far past, explicit UTC
const FUTURE  = "2099-01-01T00:00:00";  // far future, no Z

describe("getBannerState", () => {
  // ─── 1. Snapshot gate ───────────────────────────────────────────────────────
  // tier="snapshot" is the hard outer gate — free users never see a banner.
  // The gate must fire BEFORE any end_date evaluation so a snapshot user with a
  // past end_date (impossible in practice, but valid in the type) still gets null.
  describe('tier="snapshot" — hard gate, always null', () => {
    it('status="active"',    () => expect(getBannerState("snapshot", "active",    null)).toBeNull());
    it('status="past_due"',  () => expect(getBannerState("snapshot", "past_due",  null)).toBeNull());
    it('status="cancelled"', () => expect(getBannerState("snapshot", "cancelled", null)).toBeNull());
    it('status=null',        () => expect(getBannerState("snapshot", null,        null)).toBeNull());
    // Confirm tier gate fires before end_date is evaluated — past end_date still → null
    it('status="past_due" + past end_date → null (tier gate wins before end_date check)', () =>
      expect(getBannerState("snapshot", "past_due", PAST_Z)).toBeNull());
  });

  // ─── 2. Healthy / no-billing states ─────────────────────────────────────────
  describe("null for healthy or no-billing states (non-snapshot tiers)", () => {
    it('portrait + status="active" → null', () => expect(getBannerState("portrait", "active", null)).toBeNull());
    it('studio   + status="active" → null', () => expect(getBannerState("studio",   "active", null)).toBeNull());
    it('portrait + status=null     → null', () => expect(getBannerState("portrait", null,     null)).toBeNull());
    it('studio   + status=null     → null', () => expect(getBannerState("studio",   null,     null)).toBeNull());
  });

  // ─── 3. past_due state ──────────────────────────────────────────────────────
  describe('"past_due" banner state', () => {
    it('portrait + status="past_due" + end_date=null   → "past_due"', () =>
      expect(getBannerState("portrait", "past_due", null)).toBe("past_due"));

    it('portrait + status="past_due" + end_date=future → "past_due"', () =>
      expect(getBannerState("portrait", "past_due", FUTURE)).toBe("past_due"));

    it('studio   + status="past_due" + end_date=null   → "past_due"', () =>
      expect(getBannerState("studio",   "past_due", null)).toBe("past_due"));
  });

  // ─── 4. ended state ─────────────────────────────────────────────────────────
  describe('"ended" banner state', () => {
    it('portrait + status="cancelled" + end_date=null  → "ended"', () =>
      expect(getBannerState("portrait", "cancelled", null)).toBe("ended"));

    it('portrait + status="cancelled" + end_date=past  → "ended"', () =>
      expect(getBannerState("portrait", "cancelled", PAST_Z)).toBe("ended"));

    it('studio   + status="cancelled" + end_date=null  → "ended"', () =>
      expect(getBannerState("studio",   "cancelled", null)).toBe("ended"));

    // CRITICAL EDGE — incomplete_expired path:
    // Stripe maps "incomplete_expired" → "past_due" in the DB, but also sets
    // ended_at so end_date is stored as a past timestamp. A past end_date must
    // override the "past_due" status and return "ended" — without this branch
    // the banner incorrectly shows a recoverable-payment UI for a terminated sub.
    it('CRITICAL EDGE — status="past_due" + past end_date overrides to "ended" (incomplete_expired)', () =>
      expect(getBannerState("portrait", "past_due", PAST_Z)).toBe("ended"));
  });

  // ─── 5. Timezone-boundary test ──────────────────────────────────────────────
  // DB bare TIMESTAMP columns strip the Z from toISOString() on write. V8 parses
  // bare ISO date-time strings as LOCAL time, not UTC — so the offset error equals
  // the runner's TZ offset (up to ±14h).
  //
  // parseDbTimestamp appends Z to force UTC parsing. These tests FAIL in non-UTC
  // environments if that Z-append is removed:
  //   "2024-06-15T11:00:00" without Z in UTC-2 → parsed as 13:00Z → future → "past_due" (wrong)
  //   "2024-06-15T13:00:00" without Z in UTC+2 → parsed as 11:00Z → past   → "ended"    (wrong)
  //
  // vi.setSystemTime pins "now" so the ±1h offsets are deterministic across CI envs.
  // toBareTz mirrors what PostgreSQL returns: UTC value formatted without Z or offset.
  describe("parseDbTimestamp UTC boundary — fails without Z-append in non-UTC environments", () => {
    const PINNED_NOW = new Date("2024-06-15T12:00:00Z");

    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(PINNED_NOW);
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    function toBareTz(d: Date): string {
      return d.toISOString().slice(0, 19); // "YYYY-MM-DDTHH:mm:ss", no Z
    }

    it("bare string 1h before pinned UTC now → 'ended'  (fails without Z in UTC- timezone)", () => {
      const pastBare = toBareTz(new Date(PINNED_NOW.getTime() - 60 * 60 * 1000));
      // pastBare = "2024-06-15T11:00:00"
      // With Z:    11:00Z < 12:00Z (pinned now) → past → "ended"   ✓
      // Without Z in UTC-2: parsed as local 11:00 = 13:00Z → future → "past_due" ✗
      expect(getBannerState("portrait", "past_due", pastBare)).toBe("ended");
    });

    it("bare string 1h after pinned UTC now → 'past_due' (fails without Z in UTC+ timezone)", () => {
      const futureBare = toBareTz(new Date(PINNED_NOW.getTime() + 60 * 60 * 1000));
      // futureBare = "2024-06-15T13:00:00"
      // With Z:    13:00Z > 12:00Z (pinned now) → future → "past_due" ✓
      // Without Z in UTC+2: parsed as local 13:00 = 11:00Z → past → "ended"    ✗
      expect(getBannerState("portrait", "past_due", futureBare)).toBe("past_due");
    });
  });
});
