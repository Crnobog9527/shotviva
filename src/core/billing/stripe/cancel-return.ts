import { z } from 'zod'

import { PAYMENT_METHODS } from '../../analytics/events'
import { PRODUCT_IDS } from '../../config/define-site'
import { localizePath } from '../../i18n/paths'
import type { CheckoutBody } from './checkout'

// Stripe's cancel_url (T74, ARCHITECTURE §16.2 checkout_cancel): the buyer lands on our own
// /api/checkout/cancel first, which sends `checkout_cancel` from the server (so an ad blocker
// cannot drop it) and redirects to /pricing?checkout=cancel, which shows the toast (T43). The
// product and method ride in the URL because the cancel return carries no session id. Waffo has
// no cancel URL (only successUrl), so its cancels are not counted.

export const CANCEL_RETURN_PATH = '/api/checkout/cancel'
export const PRICING_CANCELLED = '/pricing?checkout=cancel'

export function cancelReturnUrl(origin: string, body: Pick<CheckoutBody, 'product_id' | 'method' | 'locale'>): string {
  const url = new URL(CANCEL_RETURN_PATH, origin)
  url.searchParams.set('p', body.product_id)
  url.searchParams.set('m', body.method)
  url.searchParams.set('l', body.locale)
  return url.toString()
}

const cancelQuery = z.object({
  p: z.enum(PRODUCT_IDS),
  m: z.enum(PAYMENT_METHODS),
  l: z.enum(['en', 'zh']).catch('en'),
})

export type CancelTrack = (userId: string, props: { product_id: (typeof PRODUCT_IDS)[number]; method: (typeof PAYMENT_METHODS)[number] }, locale: 'en' | 'zh') => void

// Where to send the buyer, counting the cancel when the query is ours and someone is signed in.
// A tampered or stale query still lands on pricing, just uncounted.
export function handleCancelReturn(params: URLSearchParams, userId: string | null, track: CancelTrack): string {
  const parsed = cancelQuery.safeParse(Object.fromEntries(params))
  const locale = parsed.success ? parsed.data.l : params.get('l') === 'zh' ? 'zh' : 'en'
  if (parsed.success && userId) track(userId, { product_id: parsed.data.p, method: parsed.data.m }, locale)
  return localizePath(PRICING_CANCELLED, locale)
}
