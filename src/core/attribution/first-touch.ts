import { z } from 'zod'

import { scrubUrl } from '../analytics/browser/posthog-config'
import { referrerHostOf } from '../analytics/share-link'

// First-touch attribution we own (ARCHITECTURE §16.6, Owner 2026-11-14): where a visitor first
// landed, kept in the first-party cookie sv_ft by the proxy and copied onto the account at sign-in
// (account_first_touch, 1546), so the funnel can split sign-ups, first images and payments by
// landing page and source without PostHog. Pure: no request objects, no crypto.

export const FIRST_TOUCH_COOKIE = 'sv_ft'
export const FIRST_TOUCH_MAX_AGE = 90 * 24 * 60 * 60

const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'] as const
const LIMIT = { path: 300, utm: 100 } as const
const SHARE_PAGE = /^\/(?:zh\/)?t\/([a-z0-9][a-z0-9-]{0,63})\/?$/
const SHARE_ID = /^[a-z0-9]{8}$/
const AFFILIATE = /^[a-z0-9-]{3,24}$/
const GRAYLUM_PAGE = /^\/(?:zh\/)?connect\/graylum(?:\/|$)/

const text = (max: number) => z.string().min(1).max(max)
// Short keys keep the cookie small; the same object is what sign-in sends to the database.
export const touchSchema = z.strictObject({
  v: z.literal(1),
  p: text(LIMIT.path),
  r: z.string().regex(/^[a-z0-9.-]{1,100}$/).optional(),
  us: text(LIMIT.utm).optional(),
  um: text(LIMIT.utm).optional(),
  uc: text(LIMIT.utm).optional(),
  ut: text(LIMIT.utm).optional(),
  un: text(LIMIT.utm).optional(),
  st: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/).optional(),
  si: z.string().regex(SHARE_ID).optional(),
  g: z.literal(1).optional(),
  a: z.string().regex(AFFILIATE).optional(),
  at: z.number().int().positive(),
})
export type FirstTouch = z.infer<typeof touchSchema>

const UTM_FIELD = { utm_source: 'us', utm_medium: 'um', utm_campaign: 'uc', utm_term: 'ut', utm_content: 'un' } as const

// Printable, single-line, trimmed to the column's length.
const clean = (value: string | null, max: number) => {
  const flat = value?.replace(/[\u0000-\u001f\u007f]/g, '').trim()
  return flat ? flat.slice(0, max) : undefined
}

export type LandingInput = { url: URL; referrer: string | null; ownHost: string; now: number }

// The landing page as the visitor opened it: path and query (sensitive parameters removed, as
// analytics does), the referring site's host only, the campaign parameters, and the markers the
// site already reads: a template share link (/t/<id>?s=), the Graylum connect page, a promoter link.
// The campaign parameters, the share link and the promoter link as touch fields.
function markersOf(url: URL): Record<string, unknown> {
  const marks: Record<string, unknown> = {}
  for (const key of UTM_KEYS) {
    const value = clean(url.searchParams.get(key), LIMIT.utm)
    if (value) marks[UTM_FIELD[key]] = value
  }
  const share = SHARE_PAGE.exec(url.pathname)
  const shareId = url.searchParams.get('s')
  if (share && shareId && SHARE_ID.test(shareId)) Object.assign(marks, { st: share[1], si: shareId })
  if (GRAYLUM_PAGE.test(url.pathname)) marks.g = 1
  const ref = url.searchParams.get('ref')
  if (ref && AFFILIATE.test(ref)) marks.a = ref
  return marks
}

export function touchOf({ url, referrer, ownHost, now }: LandingInput): FirstTouch {
  const scrubbed = new URL(scrubUrl(url.toString()))
  const host = referrer ? referrerHostOf(referrer, ownHost) : null
  return touchSchema.parse({
    v: 1,
    p: clean(`${scrubbed.pathname}${scrubbed.search}`, LIMIT.path) ?? '/',
    ...(host ? { r: host } : {}),
    ...markersOf(url),
    at: Math.floor(now / 1000),
  })
}
