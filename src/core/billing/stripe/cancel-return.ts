import { z } from 'zod'

import { PAYMENT_METHODS } from '../../analytics/events'
import { type ProductId } from '../../config'
import { productIdSchema } from '../../config/product-id'
import { localizePath } from '../../i18n/paths'
import type { CheckoutBody } from './checkout'

// Stripe's cancel_url (T74, ARCHITECTURE §16.2 checkout_cancel): the buyer lands on our own
// /api/checkout/cancel first, which sends `checkout_cancel` from the server (so an ad blocker
// cannot drop it) and redirects to /pricing?checkout=cancel, which shows the toast (T43). The
// product and method ride in the URL because the cancel return carries no session id. Waffo has
// no cancel URL (only successUrl), so its cancels are not counted.
//
// One count per checkout (control review of #280): each session's cancel URL carries a random
// attempt id `c`; once counted, the route leaves it in a cookie that only this route reads, so
// going back to the same cancel URL (history, reload) does not count again. Stripe documents the
// {CHECKOUT_SESSION_ID} placeholder for success_url only, so we use our own id.

export const CANCEL_RETURN_PATH = '/api/checkout/cancel'
export const PRICING_CANCELLED = '/pricing?checkout=cancel'
export const CANCEL_COOKIE = 'sv_checkout_cancel'

export function cancelReturnUrl(
  origin: string,
  body: Pick<CheckoutBody, 'product_id' | 'method' | 'locale'>,
  attempt: string = crypto.randomUUID(),
): string {
  const url = new URL(CANCEL_RETURN_PATH, origin)
  url.searchParams.set('p', body.product_id)
  url.searchParams.set('m', body.method)
  url.searchParams.set('l', body.locale)
  url.searchParams.set('c', attempt)
  return url.toString()
}

const cancelQuery = z.object({
  p: productIdSchema,
  m: z.enum(PAYMENT_METHODS),
  l: z.enum(['en', 'zh']).catch('en'),
  // Absent on sessions created before this change; those still count.
  c: z.string().regex(/^[0-9a-f-]{36}$/).optional().catch(undefined),
})

export type CancelTrack = (userId: string, props: { product_id: ProductId; method: (typeof PAYMENT_METHODS)[number] }, locale: 'en' | 'zh') => void

export type CancelReturn = { target: string; remember: string | null }

// Where to send the buyer, counting the cancel when the query is ours, someone is signed in and
// this attempt was not counted already (`counted`: the cookie's value). `remember` is the attempt
// id to store. A tampered or stale query still lands on pricing, just uncounted.
export function handleCancelReturn(params: URLSearchParams, userId: string | null, track: CancelTrack, counted?: string): CancelReturn {
  const parsed = cancelQuery.safeParse(Object.fromEntries(params))
  const locale = parsed.success ? parsed.data.l : params.get('l') === 'zh' ? 'zh' : 'en'
  const target = localizePath(PRICING_CANCELLED, locale)
  if (!parsed.success || !userId) return { target, remember: null }
  const attempt = parsed.data.c ?? null
  if (attempt && attempt === counted) return { target, remember: null }
  track(userId, { product_id: parsed.data.p, method: parsed.data.m }, locale)
  return { target, remember: attempt }
}
