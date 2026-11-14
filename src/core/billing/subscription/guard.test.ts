import type { SupabaseClient } from '@supabase/supabase-js'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { SiteProduct } from '../../config'
import type { RpcClient } from '../rpc'
import type { MirrorRow } from './summary'

const mocks = vi.hoisted(() => ({ mirror: vi.fn(), tier: vi.fn() }))
vi.mock('./read-summary', () => ({ readMirrorRows: mocks.mirror }))
vi.mock('../tier', () => ({ currentTier: mocks.tier }))

const { assertCanBuy, heldSubscription } = await import('./guard')

const row = (status: string, patch: Partial<MirrorRow> = {}): MirrorRow => ({
  provider: 'stripe',
  stripeSubscriptionId: 'sub_1',
  waffoOrderId: null,
  productId: 'pro_monthly',
  status,
  currentPeriodEnd: new Date('2026-12-06T00:00:00Z'),
  cancelAtPeriodEnd: false,
  ...patch,
})

const admin = {} as SupabaseClient & RpcClient
const USER = '0b6f3f0e-5d1c-4c47-9a49-6a3f6f8d2e11'
const product = (id: string, tier: string): SiteProduct => ({ id, tier, interval: 'month', credits: 1, priceUsd: 1, paidDays: 30 }) as SiteProduct

// The checkout guard (ARCHITECTURE §6.2 「升级」, T66).
describe('heldSubscription', () => {
  it.each(['active', 'trialing', 'past_due', 'unpaid', 'paused'])('a %s subscription is held', (status) => {
    expect(heldSubscription([row(status)])).toBe('pro_monthly')
  })

  it('a cancelling one is still held until it ends; Waffo rows count the same', () => {
    expect(heldSubscription([row('active', { cancelAtPeriodEnd: true })])).toBe('pro_monthly')
    expect(heldSubscription([row('active', { provider: 'waffo', stripeSubscriptionId: null, waffoOrderId: 'ORD_1', productId: 'max_yearly' })])).toBe('max_yearly')
  })

  it('takes the highest of several (an upgrade whose old cancel failed)', () => {
    expect(heldSubscription([row('active', { productId: 'starter_monthly' }), row('active', { productId: 'pro_yearly' })])).toBe('pro_yearly')
  })

  it('ended or never-started subscriptions are not held', () => {
    expect(heldSubscription([row('canceled'), row('incomplete'), row('incomplete_expired')])).toBeNull()
    expect(heldSubscription([])).toBeNull()
  })
})

describe('assertCanBuy', () => {
  beforeEach(() => {
    mocks.mirror.mockReset().mockResolvedValue([])
    mocks.tier.mockReset().mockResolvedValue(null)
  })

  it('lets a pack through without reading anything', async () => {
    expect(await assertCanBuy(admin, USER, product('pack_m', 'pack'))).toBe('buy')
    expect(mocks.mirror).not.toHaveBeenCalled()
  })

  it('answers upgrade for a higher plan', async () => {
    mocks.mirror.mockResolvedValue([row('active', { productId: 'starter_monthly' })])
    mocks.tier.mockResolvedValue('starter')
    expect(await assertCanBuy(admin, USER, product('pro_monthly', 'pro'))).toBe('upgrade')
  })

  it.each([
    ['pro_monthly', 'pro'],
    ['starter_yearly', 'starter'],
  ])('refuses %s under a running Pro monthly with 409 DOWNGRADE_NOT_ALLOWED', async (id, tier) => {
    mocks.mirror.mockResolvedValue([row('active')])
    mocks.tier.mockResolvedValue('pro')
    await expect(assertCanBuy(admin, USER, product(id, tier))).rejects.toMatchObject({ code: 'DOWNGRADE_NOT_ALLOWED' })
  })

  it('a one-time Pro period refuses Starter but renews Pro', async () => {
    mocks.tier.mockResolvedValue('pro')
    await expect(assertCanBuy(admin, USER, product('starter_monthly', 'starter'))).rejects.toMatchObject({ code: 'DOWNGRADE_NOT_ALLOWED' })
    expect(await assertCanBuy(admin, USER, product('pro_monthly', 'pro'))).toBe('buy')
  })
})
