import { DEFAULT_LOCALE, LOCALES } from '../i18n/locales'

// Page transitions between app pages (DESIGN §8.2 「页面切换过渡」, T56). The direction comes from
// where the user is and where they go, so no link has to be tagged by hand: deeper into a
// section pushes the new page in, shallower pops back, one tab root to another cross-fades.
// Anything outside the app's sections (marketing, sign-in, checkout, admin) switches instantly.
export type NavMotion = 'nav-forward' | 'nav-back' | 'nav-tab'

// The tab roots (DESIGN §8.2); every app page that animates lives under one of them.
const TAB_ROOTS = ['/generate', '/wishlist', '/photos', '/account'] as const

const PREFIXED = LOCALES.filter((locale) => locale !== DEFAULT_LOCALE)

// The path without query, hash, trailing slash or locale prefix ("/zh/photos/1?x" → "/photos/1").
export function appPath(href: string): string {
  const path = href.split(/[?#]/)[0] || '/'
  const bare = PREFIXED.reduce((current, locale) => (current === `/${locale}` ? '/' : current.startsWith(`/${locale}/`) ? current.slice(locale.length + 1) : current), path)
  return bare.length > 1 ? bare.replace(/\/+$/, '') : bare
}

const inApp = (path: string) => TAB_ROOTS.some((root) => path === root || path.startsWith(`${root}/`))
const depth = (path: string) => path.split('/').filter(Boolean).length

export function navMotion(from: string, to: string): NavMotion | null {
  const [a, b] = [appPath(from), appPath(to)]
  if (a === b || !inApp(a) || !inApp(b)) return null
  const [da, db] = [depth(a), depth(b)]
  if (da === 1 && db === 1) return 'nav-tab'
  if (db < da) return 'nav-back'
  // Deeper, or a flow page to another flow page (a workspace to its photo, an edit to the new
  // photo): forward.
  return 'nav-forward'
}

// The transition types for a navigation the user starts now, from this page to `href`. None
// under reduced motion, or where the browser has no View Transitions (an instant switch, and
// no detour through the router).
export function navTypesFor(href: string): string[] | undefined {
  if (typeof window === 'undefined' || !('startViewTransition' in document)) return undefined
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined
  const motion = navMotion(window.location.pathname, href)
  return motion ? [motion] : undefined
}
