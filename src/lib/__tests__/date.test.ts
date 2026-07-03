import { describe, it, expect } from "vitest";
import { parseDbTimestamp } from "../date";

describe("parseDbTimestamp", () => {
  // Core guarantee: bare TIMESTAMP strings (no offset marker) are treated as UTC.
  // Asserts getTime() directly — fails deterministically in ANY timezone if the
  // Z-append is removed, because V8 would parse the bare string as local time instead.
  it("bare string (no Z): getTime() matches explicit-Z equivalent", () => {
    expect(parseDbTimestamp("2024-06-15T11:00:00").getTime()).toBe(
      new Date("2024-06-15T11:00:00Z").getTime()
    );
  });

  it("bare string (no Z): toISOString() equals Z-appended form", () => {
    expect(parseDbTimestamp("2024-06-15T11:00:00").toISOString()).toBe(
      "2024-06-15T11:00:00.000Z"
    );
  });

  // Guard clauses: strings already carrying an offset must pass through unchanged.
  it("Z-suffix: passes through unchanged", () => {
    expect(parseDbTimestamp("2024-06-15T11:00:00Z").toISOString()).toBe(
      "2024-06-15T11:00:00.000Z"
    );
  });

  it("positive offset (+HH:MM): interpreted correctly, no double-shift", () => {
    expect(parseDbTimestamp("2024-06-15T11:00:00+05:30").toISOString()).toBe(
      "2024-06-15T05:30:00.000Z"
    );
  });

  it("negative offset (-HH:MM): interpreted correctly, no double-shift", () => {
    expect(parseDbTimestamp("2024-06-15T11:00:00-05:00").toISOString()).toBe(
      "2024-06-15T16:00:00.000Z"
    );
  });
});
