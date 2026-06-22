// Shared client-side validation for auth forms. Mirrors only what Supabase
// itself enforces (8+ char password) — strength scoring beyond that is
// cosmetic encouragement, never a submit blocker (per screen-spec-v1.md §2.1).

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(value: string): boolean {
  return EMAIL_RE.test(value.trim());
}

export const PASSWORD_MIN_LENGTH = 8;

export type PasswordStrength = {
  score: 0 | 1 | 2 | 3;
  meetsMinimum: boolean;
};

export function getPasswordStrength(value: string): PasswordStrength {
  if (value.length === 0) {
    return { score: 0, meetsMinimum: false };
  }
  const meetsMinimum = value.length >= PASSWORD_MIN_LENGTH;
  if (!meetsMinimum) {
    return { score: 1, meetsMinimum: false };
  }
  const hasDigit = /\d/.test(value);
  return { score: hasDigit ? 3 : 2, meetsMinimum: true };
}
