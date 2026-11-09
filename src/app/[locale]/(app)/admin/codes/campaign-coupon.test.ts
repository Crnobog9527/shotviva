import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'

import { site } from '@/site/site.config'
import type { CatalogInput } from '@/core/codes/admin'
import { saveCampaignWithCoupon } from '@/core/codes/server'

const actor = '6cc81ef7-0be7-4ad0-9106-133c4c006109'
const codeId = '5fd46df6-d35a-4f9c-9584-0c95d84fcb61'
const offer = { code: 'test20', discount_duration: 'once', discount_percent: 20, discount_products: ['starter_monthly'] }
const giftPolicy = { maxCreditsPerCode: site.growth.invite.inviteeCredits, requirePaidGiftCap: true }
function fixture(existing = false, products: readonly CatalogInput[] = site.billing.products, policy = giftPolicy) {
  const rpc = vi.fn().mockResolvedValue({ data: codeId, error: null })
  const select = { eq: () => ({ maybeSingle: async () => ({ data: existing ? { id: codeId } : null, error: null }) }) }
  const settings = { eq: () => ({ single: async () => ({ data: { value: policy }, error: null }) }) }
  const db = { rpc, from: (table: string) => ({ select: () => table === 'system_settings' ? settings : select }) } as unknown as SupabaseClient
  const coupons = { create: vi.fn().mockImplementation(async ({ id }) => ({ id })), retrieve: vi.fn() }
  return { rpc, coupons, save: (input: unknown) => saveCampaignWithCoupon(db, actor, codeId, input, products, () => coupons) }
}

describe('provisioning a campaign coupon before saving the code', () => {
  it.each(['once','repeating','forever'])('maps %s terms and uses a stable provider identity on retry', async duration => {
    const { save, coupons, rpc } = fixture()
    const fields = { ...offer, discount_duration: duration, ...(duration === 'repeating' && { discount_months: 2 }) }
    await save(fields)
    await save(fields)
    const id = coupons.create.mock.calls[0]![0].id
    expect(coupons.create).toHaveBeenNthCalledWith(2, { id, name: 'TEST20', percent_off: offer.discount_percent,
      duration, ...(duration === 'repeating' && { duration_in_months: 2 }), metadata: { code_id: codeId } }, { idempotencyKey: id })
    expect(rpc).toHaveBeenCalledWith('admin_save_code', expect.objectContaining({ p_fields: { ...fields, stripe_coupon_id: id } }))
  })

  it('does not save the database row after a Stripe failure', async () => {
    const { save, coupons, rpc } = fixture()
    coupons.create.mockRejectedValue(new Error('provider unavailable'))
    await expect(save(offer)).rejects.toThrow('provider unavailable')
    expect(rpc).not.toHaveBeenCalled()
  })

  it('recovers an existing matching coupon after Stripe has forgotten the request key', async () => {
    const { save, coupons, rpc } = fixture()
    coupons.create.mockRejectedValue(Object.assign(new Error('existing'), { code: 'resource_already_exists' }))
    coupons.retrieve.mockImplementation(async id => ({ id, valid: true, name: 'TEST20', percent_off: offer.discount_percent,
      duration: 'once', duration_in_months: null, metadata: { code_id: codeId } }))
    await save(offer)
    expect(rpc).toHaveBeenCalledTimes(1)
    coupons.retrieve.mockResolvedValue({ valid: false })
    await expect(save(offer)).rejects.toThrow('existing')
    expect(rpc).toHaveBeenCalledTimes(1)
  })

  it('keeps existing terms or gift-only codes independent of Stripe and rejects caller-supplied coupons', async () => {
    const { save, coupons } = fixture(true)
    await save({ ...offer, note: 'metadata edit' })
    await save({ code: 'gift', invitee_credits: site.growth.invite.inviteeCredits })
    await expect(save({ ...offer, stripe_coupon_id: 'untrusted' })).rejects.toThrow('INVALID_CODE_FIELDS')
    expect(coupons.create).not.toHaveBeenCalled()
  })

  it('checks the configured floor and duration before creating new coupons', async () => {
    const { save, coupons } = fixture()
    await expect(save({ ...offer, discount_products: ['max_yearly'] })).rejects.toThrow('CODE_DISCOUNT_PRODUCTS')
    await expect(save({ ...offer, discount_duration: 'repeating' })).rejects.toThrow('INVALID_DISCOUNT')
    expect(coupons.create).not.toHaveBeenCalled()
  })
})

describe('preflight before a new campaign creates an external coupon', () => {
  it('rejects a discount that only falls below the floor when Stripe rounds a half cent', async () => {
    const { save, rpc, coupons } = fixture(false, [
      { id: 'starter_monthly', tier: 'starter', credits: 1, priceUsd: 1.51 },
      { id: 'max_yearly', tier: 'max', credits: 2, priceUsd: 1.51 },
    ])
    await expect(save({ ...offer, discount_percent: 50 })).rejects.toThrow('CODE_DISCOUNT_PRODUCTS: starter_monthly')
    expect(coupons.create).not.toHaveBeenCalled()
    expect(rpc).not.toHaveBeenCalled()
  })

  it('uses current configured gift limits and cap policy for a combined campaign before calling Stripe', async () => {
    const { save, coupons } = fixture()
    const mixed = { ...offer, invitee_credits: giftPolicy.maxCreditsPerCode, invitee_pool: 'paid' }
    await expect(save(mixed)).rejects.toThrow('CODE_GIFT_CAP_REQUIRED')
    await expect(save({ ...mixed, invitee_credits: giftPolicy.maxCreditsPerCode + 1 })).rejects.toThrow('CODE_GIFT_LIMIT')
    expect(coupons.create).not.toHaveBeenCalled()
    const relaxed = fixture(false, site.billing.products, { ...giftPolicy, requirePaidGiftCap: false })
    await relaxed.save(mixed)
    expect(relaxed.coupons.create).toHaveBeenCalledOnce()
  })
})
