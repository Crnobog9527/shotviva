import type { Locale } from '../i18n/locales'
import { localizePath, splitLocale } from '../i18n/paths'

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

// `next` for a login or signup page in `locale`: a valid `next` is kept as written (it already
// carries its language), the fallback is the account page of the page's own language.
export function nextIn(value: string | null | undefined, locale: Locale): string {
  const next = sanitizeNext(value)
  return next === DEFAULT_AFTER_LOGIN ? localizePath(next, locale) : next
}

// Where a login or sign-up page's visitor came from, for the line under its title
// (design/comps-v3-b/auth.html `?next=photo|graylum`): the home generator (its draft waits on
// the home page) or the Graylum connect page. `connectPath` is core/partner's CONNECT_PAGE_PATH.
export type ArrivedFrom = 'home' | 'graylum' | null

export function arrivedFrom(next: string, connectPath: string): ArrivedFrom {
  const { path } = splitLocale(new URL(sanitizeNext(next), 'http://local.invalid').pathname)
  if (path === '/') return 'home'
  if (path === connectPath || path.startsWith(`${connectPath}/`)) return 'graylum'
  return null
}

// Where a signed-in visitor of /login or /signup goes instead of the form (DESIGN §6.9 item 4):
// the `next` they came with when it is a safe same-site path, otherwise the app (/generate) in
// the page's language.
export const SIGNED_IN_HOME = '/generate'

export function signedInTarget(value: string | null | undefined, locale: Locale): string {
  const home = localizePath(SIGNED_IN_HOME, locale)
  if (!value) return home
  const next = sanitizeNext(value)
  // sanitizeNext answers DEFAULT_AFTER_LOGIN for anything unsafe; only keep it when asked for.
  return next === DEFAULT_AFTER_LOGIN && value !== DEFAULT_AFTER_LOGIN ? home : next
}
