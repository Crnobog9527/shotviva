// The only values a web-vitals report may carry (Owner 2026-11-24: numbers only, no personal
// data). Shared by the browser (which builds the report) and /api/vitals (which checks it), and
// matched one for one by the checks on public.web_vitals (migration 2000). No zod here: this file
// ships in the browser chunk.

export const VITAL_METRICS = ['LCP', 'FCP', 'TTFB', 'INP', 'CLS'] as const
export const VITAL_RATINGS = ['good', 'needs-improvement', 'poor'] as const
// The signed-in app's tab roots. /admin, /checkout, /join, /connect are left out on purpose.
export const VITAL_ROUTES = ['generate', 'photos', 'posters', 'account', 'wishlist'] as const
export const VITAL_LOCALES = ['en', 'zh'] as const
export const VITAL_NAV_TYPES = ['navigate', 'reload', 'back-forward', 'prerender', 'restore'] as const
export const VITAL_EFFECTIVE_TYPES = ['slow-2g', '2g', '3g', '4g'] as const

// Upper bounds: anything above is a broken clock or a forged report, not a slow page.
export const MAX_VITAL_MS = 120_000
export const MAX_VITAL_CLS = 100

export type VitalMetric = (typeof VITAL_METRICS)[number]
export type VitalRating = (typeof VITAL_RATINGS)[number]
export type VitalRoute = (typeof VITAL_ROUTES)[number]
export type VitalLocale = (typeof VITAL_LOCALES)[number]
export type VitalNavType = (typeof VITAL_NAV_TYPES)[number]
export type VitalEffectiveType = (typeof VITAL_EFFECTIVE_TYPES)[number]

// Everything one report holds. No user, visitor or session id, no URL, no user agent, no time.
export type VitalReport = {
  metric: VitalMetric
  value: number
  rating: VitalRating
  route: VitalRoute
  locale: VitalLocale
  nav: VitalNavType
  standalone: boolean
  sw: boolean
  net: VitalEffectiveType | null
}

export const isOneOf = <T extends string>(list: readonly T[], value: unknown): value is T =>
  typeof value === 'string' && (list as readonly string[]).includes(value)
