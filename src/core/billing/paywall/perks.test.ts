import { describe, expect, it } from 'vitest'

import { TEST_PRODUCTS } from '../stripe/test-products'
import { TIER_LIMITS } from '../tier-limits'
import { tierOffers } from './offer'
import { tierPerks } from './perks'
import { compareRows } from './plan-compare-rows'

const keys = (tier: 'starter' | 'pro' | 'max', options = { wishlistLive: false, memberPacks: false }) => tierPerks(tier, options).live.map((p) => p.key)
const value = (tier: 'starter' | 'pro' | 'max', key: string) => tierPerks(tier, { wishlistLive: true, memberPacks: true }).live.find((p) => p.key === key)?.values

describe('tier perks (ARCHITECTURE §6.2 会员档位权益, Owner 2026-11-10 order)', () => {
  it('lists every row in one order: speed, batch, member packs, support, vote, basics', () => {
    expect(keys('starter', { wishlistLive: true, memberPacks: true })).toEqual(['concurrency', 'batch', 'memberPacks', 'support', 'basics'])
    expect(keys('pro', { wishlistLive: true, memberPacks: true })).toEqual(['concurrency', 'batch', 'memberPacks', 'support', 'basics'])
    expect(keys('max', { wishlistLive: true, memberPacks: true })).toEqual(['concurrency', 'batch', 'memberPacks', 'supportPriority', 'wishlistVotes', 'basics'])
  })

  it('reads every number from TIER_LIMITS and the pack member rate', () => {
    expect((['starter', 'pro', 'max'] as const).map((tier) => value(tier, 'concurrency')?.count)).toEqual([1, 3, 6])
    expect((['starter', 'pro', 'max'] as const).map((tier) => value(tier, 'batch')?.count)).toEqual([1, 10, 30])
    expect((['starter', 'pro', 'max'] as const).map((tier) => value(tier, 'memberPacks')?.pct)).toEqual([5, 10, 15])
    expect([value('starter', 'support')?.hours, value('pro', 'support')?.hours, value('max', 'supportPriority')?.hours]).toEqual([48, 48, 24])
    expect(value('max', 'wishlistVotes')).toEqual({ weight: TIER_LIMITS.max.voteWeight })
  })

  it('lists the weighted vote only while the wishlist is on, and the pack rate only when live', () => {
    expect(keys('max')).not.toContain('wishlistVotes')
    expect(keys('max')).not.toContain('memberPacks')
    expect(keys('max', { wishlistLive: true, memberPacks: false })).toContain('wishlistVotes')
  })

  it('never lists unbuilt perks or queue priority', () => {
    for (const tier of ['starter', 'pro', 'max'] as const) {
      const perks = tierPerks(tier, { wishlistLive: true, memberPacks: true })
      expect(perks.soon).toEqual([])
      expect(perks.live.some((p) => /queue/i.test(p.key))).toBe(false)
    }
  })
})

describe('plan comparison rows', () => {
  const offers = tierOffers(TEST_PRODUCTS)
  const prices = { cheapest: 1, common: 2 }

  it('has the cards rows in the same order, one cell per tier', () => {
    const rows = compareRows(offers, { wishlistLive: true, memberPacks: true, photoPrices: prices })
    expect(rows.map((row) => row.key)).toEqual(['credits', 'photos', 'concurrency', 'batch', 'memberPacks', 'support', 'votes', 'noWatermark', 'private', 'allTemplates'])
    for (const row of rows) expect(row.cells).toHaveLength(offers.length)
    expect(rows.find((row) => row.key === 'votes')?.cells).toEqual([1, 1, 3].map((value) => ({ format: 'weight', value })))
    expect(rows.find((row) => row.key === 'photos')?.cells[0]).toEqual({ format: 'range', range: { low: Math.floor(offers[0]!.monthly.credits / 2), high: offers[0]!.monthly.credits } })
  })

  it('drops the vote, pack and estimate rows when they are not live', () => {
    const rows = compareRows(offers, { wishlistLive: false, memberPacks: false, photoPrices: null }).map((row) => row.key)
    expect(rows).not.toContain('votes')
    expect(rows).not.toContain('memberPacks')
    expect(rows).not.toContain('photos')
  })
})
