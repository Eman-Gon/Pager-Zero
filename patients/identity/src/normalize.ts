/**
 * Canonical form of an email: trimmed and lower-cased so that
 * "  Foo@Bar.COM " and "foo@bar.com" resolve to the same account.
 * BUG CLASS: incomplete string normalization (dropping the lower-case
 * step), which makes account lookup case-sensitive.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Storage key for an account, derived from the normalized email. */
export function accountKey(email: string): string {
  return `user:${normalizeEmail(email)}`;
}

/** Whether two raw email inputs refer to the same account. */
export function sameUser(a: string, b: string): boolean {
  return accountKey(a) === accountKey(b);
}
