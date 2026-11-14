import 'server-only'

import { createHash } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import type Stripe from 'stripe'

import { AppError } from '../errors'
import { campaignCatalog, type CatalogInput } from './admin'
import { readGiftPolicy } from './gift-policy'
import { codePatch, invalidDiscountProducts, saveCode } from './save-code'

type Coupons = Pick<Stripe['coupons'], 'create' | 'retrieve'>
type Terms = { name: string; percent_off: number; duration: 'once' | 'repeating' | 'forever'; duration_in_months?: number }

function matchesTerms(coupon: Stripe.Coupon, codeId: string, terms: Terms) {
  return coupon.valid && coupon.metadata?.code_id === codeId && coupon.name === terms.name
    && coupon.percent_off === terms.percent_off && coupon.duration === terms.duration
    && coupon.duration_in_months === (terms.duration_in_months ?? null)
}

// The same administrative save can retry after either provider times out, including after
// Stripe's idempotency retention expires. Never delete a coupon on an ambiguous database write.
async function ensureCoupon(coupons: Coupons, codeId: string, terms: Terms) {
  const digest = createHash('sha256').update(JSON.stringify(terms)).digest('hex').slice(0, 24)
  const id = `sv_${codeId}_${digest}`
  try {
    return (await coupons.create({ ...terms, id, metadata: { code_id: codeId } }, { idempotencyKey: id })).id
  } catch (error) {
    if (!(error instanceof Error) || !('code' in error) || error.code !== 'resource_already_exists') throw error
    const existing = await coupons.retrieve(id)
    if (!matchesTerms(existing, codeId, terms)) throw error
    return existing.id
  }
}

function newCouponTerms(fields: ReturnType<typeof codePatch>, products: readonly CatalogInput[]): Terms {
  const { code, discount_percent, discount_duration, discount_months, discount_products } = fields
  if (!code || !discount_percent || !discount_duration || !discount_products?.length
    || (discount_duration === 'repeating') !== (discount_months != null)) throw new AppError('INVALID_INPUT', 'INVALID_DISCOUNT')
  const { catalog, floor } = campaignCatalog(products)
  const invalid = invalidDiscountProducts(fields, catalog, floor)
  if (invalid.length) throw new AppError('INVALID_INPUT', 'CODE_DISCOUNT_PRODUCTS: ' + invalid.join(', '))
  return { name: code.toUpperCase(), percent_off: discount_percent, duration: discount_duration,
    ...(discount_months != null && { duration_in_months: discount_months }) }
}

// Reject known invalid terms before provisioning an external coupon. The database
// rechecks the constraints and policy atomically in case an administrator changed them.
async function checkNewCampaign(db: SupabaseClient, fields: ReturnType<typeof codePatch>) {
  if (fields.starts_at && fields.expires_at && Date.parse(fields.starts_at) >= Date.parse(fields.expires_at)) {
    throw new AppError('INVALID_INPUT', 'INVALID_CODE_FIELDS')
  }
  if (fields.invitee_credits == null) {
    if (fields.invitee_pool) throw new AppError('INVALID_INPUT', 'INVALID_CODE_FIELDS')
    return
  }
  const policy = await readGiftPolicy(db)
  if (fields.invitee_credits > policy.maxCreditsPerCode) throw new AppError('INVALID_INPUT', 'CODE_GIFT_LIMIT')
  if (fields.invitee_pool === 'paid' && policy.requirePaidGiftCap && !fields.max_redemptions) {
    throw new AppError('INVALID_INPUT', 'CODE_GIFT_CAP_REQUIRED')
  }
}

export async function saveCampaignWithCoupon(db: SupabaseClient, actor: string, codeId: string, input: unknown,
  products: readonly CatalogInput[], coupons: () => Coupons) {
  const fields = codePatch(codeId, input)
  // Only this server writes the provider ID. Edits leave immutable terms in the locked row.
  if ('stripe_coupon_id' in fields) throw new AppError('INVALID_INPUT', 'INVALID_CODE_FIELDS')
  if (fields.discount_percent) {
    const { data, error } = await db.from('codes').select('id').eq('id', codeId).maybeSingle()
    if (error) throw new AppError('INTERNAL', 'Could not read campaign')
    if (!data) {
      const terms = newCouponTerms(fields, products)
      await checkNewCampaign(db, fields)
      fields.stripe_coupon_id = await ensureCoupon(coupons(), codeId.toLowerCase(), terms)
    }
  }
  return saveCode(db, actor, codeId, fields, products)
}
