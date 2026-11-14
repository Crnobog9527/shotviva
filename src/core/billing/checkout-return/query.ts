import { z } from 'zod'

import { type ProductId } from '../../config'
import { productIdSchema } from '../../config/product-id'

// What the return address carries (T43). Stripe: the Checkout Session id that Stripe fills into
// success_url ({CHECKOUT_SESSION_ID}). Waffo has no such placeholder, so its success URL names
// the product and the page looks for this buyer's recent payment of it. Anything else is no query.
export type ReturnQuery = { channel: 'stripe'; sessionId: string } | { channel: 'waffo'; productId: ProductId }

const sessionId = z.string().regex(/^cs_(test|live)_[A-Za-z0-9]{8,200}$/)

export function readReturnQuery(params: Record<string, string | string[] | undefined>): ReturnQuery | null {
  const one = (key: string) => (typeof params[key] === 'string' ? params[key] : undefined)
  const session = sessionId.safeParse(one('session_id'))
  if (session.success) return { channel: 'stripe', sessionId: session.data }
  const product = productIdSchema.safeParse(one('p'))
  if (one('channel') === 'waffo' && product.success) return { channel: 'waffo', productId: product.data }
  return null
}

// The Graylum way back (ARCHITECTURE §14.5) rides along on the return address as before.
export function partnerParams(params: Record<string, string | string[] | undefined>): { from: string | null; return_to: string | null } {
  const one = (key: string) => (typeof params[key] === 'string' ? (params[key] as string) : null)
  return { from: one('from'), return_to: one('return_to') }
}
