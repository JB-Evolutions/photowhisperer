// parseDbTimestamp: TIMESTAMP columns (declared without TIME ZONE) strip the Z
// suffix from JS toISOString() output on write. The stored value is UTC but
// returned without an offset marker, causing V8 to parse it as local time —
// a bug of up to ±14h depending on the caller's timezone. Appending Z restores
// correct UTC interpretation. Guard clauses make this safe on any ISO string:
// TIMESTAMPTZ columns and already-suffixed strings pass through unchanged.
export function parseDbTimestamp(value: string): Date {
  if (
    value.endsWith("Z") ||
    value.includes("+") ||
    /[+-]\d{2}:\d{2}$/.test(value)
  ) {
    return new Date(value);
  }
  return new Date(value + "Z");
}
