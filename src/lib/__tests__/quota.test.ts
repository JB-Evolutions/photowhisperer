import { describe, it, expect, vi, afterEach } from "vitest";
import { utcQuotaPeriod, nextResetDate } from "../quota";

describe("utcQuotaPeriod", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns UTC month=1 when UTC is still January, even if UTC+13 local would show February", () => {
    // 2026-01-31T11:30:00Z — in Pacific/Auckland (NZDT, UTC+13) this instant is
    // 2026-02-01T00:30 local, so a naive getMonth() on a UTC+13 server returns 2.
    // getUTCMonth() must return 0 (January), so quotaMonth must be 1.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-31T11:30:00Z"));
    const { quotaMonth, quotaYear } = utcQuotaPeriod();
    expect(quotaMonth).toBe(1);
    expect(quotaYear).toBe(2026);
  });

  it("returns month=1 one second before UTC midnight at a month boundary", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-31T23:59:59Z"));
    const { quotaMonth, quotaYear } = utcQuotaPeriod();
    expect(quotaMonth).toBe(1);
    expect(quotaYear).toBe(2026);
  });

  it("flips to month=2 one minute after UTC midnight at a month boundary", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-01T00:01:00Z"));
    const { quotaMonth, quotaYear } = utcQuotaPeriod();
    expect(quotaMonth).toBe(2);
    expect(quotaYear).toBe(2026);
  });

  it("handles December without rolling year prematurely", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-12-31T23:59:59Z"));
    const { quotaMonth, quotaYear } = utcQuotaPeriod();
    expect(quotaMonth).toBe(12);
    expect(quotaYear).toBe(2026);
  });

  it("rolls to January of the new year one minute after UTC midnight on Dec 31", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2027-01-01T00:01:00Z"));
    const { quotaMonth, quotaYear } = utcQuotaPeriod();
    expect(quotaMonth).toBe(1);
    expect(quotaYear).toBe(2027);
  });
});

describe("nextResetDate", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns '1 November 2026' for a mid-October date", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-15T12:00:00Z"));
    expect(nextResetDate()).toBe("1 November 2026");
  });

  it("returns '1 January 2027' for a mid-December date (year rollover)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-12-15T00:00:00Z"));
    expect(nextResetDate()).toBe("1 January 2027");
  });
});

describe("nextResetDate — always requests UTC rendering", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // Mutating process.env.TZ mid-test does not reliably affect
  // Intl/toLocaleDateString inside vitest's worker pool (verified: the
  // resolved timezone stays pinned to the host's zone regardless of
  // reassignment). So instead of asserting on rendered output across
  // simulated zones, assert on the call contract itself: nextResetDate
  // must ask toLocaleDateString for UTC explicitly. This is
  // environment-independent and fails the moment that option is dropped,
  // regardless of what machine or CI runner executes it.
  it("passes timeZone: 'UTC' to toLocaleDateString", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-15T12:00:00Z"));

    const spy = vi.spyOn(Date.prototype, "toLocaleDateString");
    nextResetDate();

    expect(spy).toHaveBeenCalledTimes(1);
    const options = spy.mock.calls[0][1];
    expect(options).toMatchObject({ timeZone: "UTC" });
  });
});
