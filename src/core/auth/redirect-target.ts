export const DEFAULT_AFTER_LOGIN = '/account'

// Only same-site absolute paths survive; anything that could become an off-site URL
// (`//host`, `/\host`, schemes, control characters) falls back to the default.
export function sanitizeNext(value: string | null | undefined): string {
  if (!value || value.length > 512) return DEFAULT_AFTER_LOGIN
  if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return DEFAULT_AFTER_LOGIN
  if (/[\u0000-\u001f\u007f]/.test(value)) return DEFAULT_AFTER_LOGIN
  try {
    const url = new URL(value, 'http://local.invalid')
    if (url.origin !== 'http://local.invalid') return DEFAULT_AFTER_LOGIN
    // Dot-segment normalisation can turn `/.//host` into the protocol-relative `//host`.
    if (url.pathname.startsWith('//')) return DEFAULT_AFTER_LOGIN
    return `${url.pathname}${url.search}`
  } catch {
    return DEFAULT_AFTER_LOGIN
  }
}

export function loginPath(next?: string): string {
  return `/login?next=${encodeURIComponent(sanitizeNext(next))}`
}
