import { z } from 'zod'

import { MEMBERSHIP_TIERS, type SiteProduct } from '../config'
import { AppError } from '../errors'
import { hasMemberRate, type CheckoutPrice } from './checkout-price'

// Apart from checkout-price.ts, which the paywall imports in the browser: zod stays server-side.
// Only server-written metadata from an authenticated channel object may enter here.
// Missing version is a legacy contract. Unknown or incomplete snapshots must be retried.
const snapshot = z.object({
  pricing_version: z.literal('v2'),
  quoted_credits: z.string().regex(/^[1-9]\d{0,8}$/).transform(Number),
  quoted_usd_cents: z.string().regex(/^[1-9]\d{0,8}$/).transform(Number),
  pack_member_tier: z.union([z.enum(MEMBERSHIP_TIERS), z.literal('none')]),
})

export function readQuote(metadata: Record<string, unknown>, product: SiteProduct): CheckoutPrice | undefined {
  if (metadata.pricing_version == null && metadata.quoted_usd_cents == null && metadata.pack_member_tier == null && metadata.quoted_credits == null) return undefined
  const result = snapshot.safeParse(metadata)
  if (!result.success) throw new AppError('INVALID_INPUT', 'Invalid checkout pricing snapshot')
  const { quoted_usd_cents: cents, quoted_credits: credits, pack_member_tier: tier } = result.data
  if (tier !== 'none' && !hasMemberRate(product)) throw new AppError('INVALID_INPUT', 'Unexpected member rate on checkout')
  return { cents, credits, memberTier: tier === 'none' ? null : tier }
}
