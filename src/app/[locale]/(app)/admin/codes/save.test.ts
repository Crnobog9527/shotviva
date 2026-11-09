import { describe, expect, it, vi } from 'vitest'

import { campaignCatalog, belowDiscountFloor, type CatalogInput } from '@/core/codes/admin'
import { saveCode } from '@/core/codes/server'
import { site } from '@/site/site.config'
import { saveCampaignCode } from './save'

const adminId = '6cc81ef7-0be7-4ad0-9106-133c4c006109'
const codeId = '5fd46df6-d35a-4f9c-9584-0c95d84fcb61'
const { rpc, requireAdmin } = vi.hoisted(() => ({ rpc: vi.fn(), requireAdmin: vi.fn() }))
vi.mock('@/core/auth', () => ({ createAdminSupabase: () => ({ rpc }), requireAdmin }))

function product(id: CatalogInput['id'], priceUsd: number, credits: number, tier: CatalogInput['tier']): CatalogInput {
  return { id, priceUsd, credits, tier }
}

const fixtures = [product('pro_monthly', 5, 500, 'pro'), product('starter_monthly', 5, 400, 'starter'),
  product('pack_s', 1, 1000, 'pack')]

describe('campaign discount floor', () => {
  it.each([
    { scale: 1, price: 4.99, below: true },
    { scale: 1, price: 5, below: false },
    { scale: 1, price: 5.01, below: false },
    { scale: 100, price: 4.99, below: true },
    { scale: 100, price: 5, below: false },
    { scale: 100, price: 5.01, below: false },
  ])('compares a 20% discount at USD $price and credit scale $scale', ({ price, scale, below }) => {
    const products = fixtures.map(p => ({ ...p, credits: p.credits * scale, priceUsd: p.tier === 'starter' ? price : p.priceUsd }))
    const { catalog, floor } = campaignCatalog(products)
    expect(floor.id).toBe('pro_monthly')
    expect(belowDiscountFloor(catalog[1]!, floor, 20)).toBe(below)
    expect(belowDiscountFloor(catalog[2]!, floor, 1)).toBe(true)
  })

  it('distinguishes adjacent rational prices that compare equal using floating-point arithmetic', () => {
    const n = 1_000_000_000
    const { floor, catalog } = campaignCatalog([product('pro_monthly', n / 100, n - 1, 'pro'),
      product('pack_l', (n + 1) * 2 / 100, n, 'pack')])
    const pack = catalog[1]!
    expect(pack.priceCents * 50 * floor.credits).toBe(floor.priceCents * 100 * pack.credits)
    expect(belowDiscountFloor(pack, floor, 50)).toBe(true)
  })

  it.each([[4.009, 50], [0, 50], [5, 0], [5, 1.5], [5, 2_147_483_648]])(
    'rejects an unrepresentable catalog entry (%s USD, %s credits)', (price, credits) => {
      expect(() => campaignCatalog([product('pro_monthly', price, credits, 'pro')])).toThrow('Invalid campaign product economics')
    },
  )

  it('requires a subscription and uses a stable tie break', () => {
    expect(() => campaignCatalog([fixtures[2]!])).toThrow('Missing subscription')
    expect(() => campaignCatalog([fixtures[0]!, fixtures[0]!])).toThrow('Duplicate')
    const tie = [fixtures[0]!, product('starter_monthly', 10, 1000, 'starter')]
    expect(campaignCatalog(tie).floor.id).toBe(campaignCatalog(tie.reverse()).floor.id)
  })
})

describe('campaign save entry point', () => {
  it('authenticates the actor and sends only server-configured catalog data to the five-argument RPC', async () => {
    requireAdmin.mockResolvedValue({ id: adminId })
    rpc.mockResolvedValue({ data: codeId, error: null })
    const { catalog, floor } = campaignCatalog(site.billing.products)
    const fields = { note: '运营备注' }
    expect(await saveCampaignCode(codeId, fields)).toBe(codeId)
    expect(rpc).toHaveBeenCalledWith('admin_save_code', {
      p_actor: adminId, p_code_id: codeId, p_fields: fields, p_catalog: catalog, p_floor_product_id: floor.id,
    })
    expect(catalog).toHaveLength(site.billing.products.length)
    expect(catalog[0]).toEqual({
      id: site.billing.products[0].id, priceCents: Math.round(site.billing.products[0].priceUsd * 100),
      credits: site.billing.products[0].credits, subscription: true,
    })
  })

  it('allows full-form metadata edits to an existing discount after the catalog floor increases', async () => {
    const db = { rpc: vi.fn().mockResolvedValue({ data: codeId, error: null }) }
    const terms = { code: 'SPRING20', discount_percent: 20, discount_products: ['starter_monthly'],
      stripe_coupon_id: 'coupon-old', discount_duration: 'once' }
    await saveCode(db, adminId, codeId, { ...terms, note: 'before' }, fixtures)
    const repriced = fixtures.map(p => p.id === 'pro_monthly' ? { ...p, priceUsd: 5.5 } : p)
    const { catalog, floor } = campaignCatalog(repriced)
    expect(belowDiscountFloor(catalog[1]!, floor, 20)).toBe(true)
    const updated = { ...terms, note: 'after' }
    await expect(saveCode(db, adminId, codeId, updated, repriced)).resolves.toBe(codeId)
    expect(db.rpc).toHaveBeenLastCalledWith('admin_save_code', expect.objectContaining({ p_fields: updated, p_catalog: catalog }))
  })

  it('names the exact targets below the floor after the database rejects the new campaign', async () => {
    const db = { rpc: vi.fn().mockResolvedValue({ data: null, error: { message: 'CODE_DISCOUNT_PRODUCTS' } }) }
    const fields = { discount_percent: 21, discount_products: ['starter_monthly'] }
    await expect(saveCode(db, adminId, codeId, fields, fixtures))
      .rejects.toMatchObject({ code: 'INVALID_INPUT', message: 'CODE_DISCOUNT_PRODUCTS: starter_monthly' })
    expect(db.rpc).toHaveBeenCalledOnce()
  })

  it('rejects a caller-supplied catalog before writing', async () => {
    const db = { rpc: vi.fn() }
    await expect(saveCode(db, adminId, codeId, { p_catalog: [], p_floor_product_id: 'pack_s' }, fixtures))
      .rejects.toMatchObject({ code: 'INVALID_INPUT' })
    expect(db.rpc).not.toHaveBeenCalled()
  })

  it('leaves gift limits and the paid-gift cap to the configured database policy', async () => {
    const db = { rpc: vi.fn().mockResolvedValue({ data: codeId, error: null }) }
    const gift = { code: 'GIFT', invitee_credits: 10_000, invitee_pool: 'paid' }
    await saveCode(db, adminId, codeId, gift, fixtures)
    expect(db.rpc).toHaveBeenCalledWith('admin_save_code', expect.objectContaining({ p_fields: gift }))
    db.rpc.mockResolvedValue({ data: null, error: { message: 'CODE_GIFT_CAP_REQUIRED' } })
    await expect(saveCode(db, adminId, codeId, gift, fixtures)).rejects.toMatchObject({ code: 'INVALID_INPUT', message: 'CODE_GIFT_CAP_REQUIRED' })
  })
})
