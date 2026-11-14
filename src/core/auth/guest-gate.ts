import type { Locale } from '../i18n/locales'
import type { Identity } from './identity'
import { signedInTarget } from './redirect-target'

// /login and /signup are static pages (the form is in the cached HTML, so it shows at once on a
// slow cross-border link); a signed-in visitor is sent on by the proxy instead of by the page
// (DESIGN §6.9 item 4). Only a request with a session cookie is checked, so a signed-out visitor
// pays nothing. Unverified accounts and a check that could not run see the form.
export const GUEST_PAGE = /^\/(login|signup)\/?$/

// The login page's notices (?error=…): with one, the form is the point, so no redirect.
export const LOGIN_NOTICES = ['unverified', 'link_expired', 'callback_failed', 'oauth_failed'] as const

export function loginNotice(value: string | null | undefined): (typeof LOGIN_NOTICES)[number] | null {
  return LOGIN_NOTICES.find((notice) => notice === value) ?? null
}

// `path` is the logical path (no /zh prefix). The target for a signed-in visitor, or null.
export function guestRedirect(identity: Identity, path: string, search: URLSearchParams, locale: Locale): string | null {
  if (identity.status !== 'signed_in' || !identity.user.verified) return null
  if (path.startsWith('/login') && loginNotice(search.get('error'))) return null
  return signedInTarget(search.get('next'), locale)
}
