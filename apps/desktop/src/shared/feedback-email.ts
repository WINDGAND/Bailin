/** Optional contact must be a simple email: local@domain.tld, no spaces. */
export function isFeedbackEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
