// ARCHITECTURE §16.1: no email, user copy, `note`, image URL or prompt may reach PostHog.
// The strict event schemas already refuse unknown keys; this guard runs first so a caller
// passing such a field is rejected with a reason that names the key, never the value.

const FORBIDDEN_KEY = /e-?mail|copy|note|prompt|url|image|text|name|phone|password|token/i
const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/
const URL_LIKE = /[a-z][a-z0-9+.-]*:\/\/|^\/\/|\bwww\./i

export function findPii(props: unknown): string[] {
  if (props === null || typeof props !== 'object' || Array.isArray(props)) return []
  const problems: string[] = []
  for (const [key, value] of Object.entries(props)) {
    if (FORBIDDEN_KEY.test(key)) problems.push(`${key}: forbidden_key`)
    else if (typeof value === 'string' && (EMAIL.test(value) || URL_LIKE.test(value))) problems.push(`${key}: pii_value`)
  }
  return problems
}
