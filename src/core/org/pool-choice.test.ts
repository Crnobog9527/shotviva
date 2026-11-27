import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@/core/logger', () => ({ logger: { warn: vi.fn() } }))

const { offerOf } = await import('./pool-choice')
const { chargePool, creditsNeeded, defaultTier, orgBalance, tierPool } = await import('@/core/billing/pools')
const { choiceInput } = await import('@/core/jobs/run-generation')
const { generateBodySchema, toGenerationRequest } = await import('@/core/jobs/generation-request')

const now = new Date('2026-11-21T10:00:00Z')
const live = { orgs: { promo_expires_at: '2026-12-01T00:00:00Z' } }

// 在职成员只用企业积分、出图时自选 (ARCHITECTURE §6.5), mirroring _reserve_pool.
describe('offerOf', () => {
  it("gives an active member the org's shares only, and the remembered choice", () => {
    expect(offerOf({ held_credits: 100, held_promo_credits: 40, ...live }, { credits: 120, free_credits: 60, org_pool_choice: 'promo' }, now))
      .toEqual({ paid: 100, promo: 40, last: 'promo' })
    expect(offerOf({ held_credits: 1, held_promo_credits: 1, ...live }, { credits: 1, free_credits: 1, org_pool_choice: null }, now)).toMatchObject({ last: 'paid' })
  })
  it('counts no promotion share once the month is over, and caps each share at the balance', () => {
    expect(offerOf({ held_credits: 100, held_promo_credits: 40, orgs: { promo_expires_at: '2026-11-01T00:00:00Z' } }, { credits: 100, free_credits: 40, org_pool_choice: null }, now)).toMatchObject({ promo: 0 })
    expect(offerOf({ held_credits: 100, held_promo_credits: 40, orgs: { promo_expires_at: null } }, { credits: 100, free_credits: 40, org_pool_choice: null }, now)).toMatchObject({ promo: 0 })
    expect(offerOf({ held_credits: 100, held_promo_credits: 40, ...live }, { credits: 30, free_credits: 10, org_pool_choice: null }, now)).toMatchObject({ paid: 30, promo: 10 })
  })
  it('spends the promotion share as the free pool and the paid share as the paid pool', () => {
    expect(orgBalance({ paid: 3, promo: 4, last: 'paid' })).toEqual({ paid: 3, free: 4 })
  })
})

// The tier decides the pool (Owner 2026-11-23, 1996), mirroring _reserve_pool_for_tier.
describe('tier pools', () => {
  it('pays 1K from the free pool only and 2K / 4K from the paid pool only, never the other one', () => {
    expect([tierPool('1k'), tierPool('2k'), tierPool('4k')]).toEqual(['free', 'paid', 'paid'])
    expect(chargePool({ paid: 100, free: 0 }, 10, '1k')).toBeNull()
    expect(chargePool({ paid: 0, free: 100 }, 10, '2k')).toBeNull()
    expect(chargePool({ paid: 0, free: 10 }, 10, '1k')).toBe('free')
    expect(chargePool({ paid: 10, free: 0 }, 10, '4k')).toBe('paid')
  })
  it('counts only paid credits still to buy, and none for 1K (buying never pays it)', () => {
    expect(creditsNeeded({ paid: 3, free: 100 }, 10, '2k')).toBe(7)
    expect(creditsNeeded({ paid: 30, free: 0 }, 10, '2k')).toBe(0)
    expect(creditsNeeded({ paid: 0, free: 0 }, 10, '1k')).toBe(0)
  })
  it('starts on 2K when paid credits cover it, else 1K when free credits do, else nothing', () => {
    const costs = { '1k': 10, '2k': 10, '4k': 20 }
    const all = ['1k', '2k', '4k'] as const
    expect(defaultTier({ paid: 10, free: 100 }, costs, all)).toBe('2k')
    expect(defaultTier({ paid: 9, free: 10 }, costs, all)).toBe('1k')
    expect(defaultTier({ paid: 9, free: 9 }, costs, all)).toBeNull()
    expect(defaultTier({ paid: 100, free: 100 }, costs, ['1k', '4k'] as const)).toBe('1k') // 2K not offered
  })
})

describe('pool_choice on the request', () => {
  const body = (extra: object) => generateBodySchema.parse({ template_id: 't', ...extra })
  it('passes a choice for a single web job only', () => {
    const req = toGenerationRequest('u', body({ pool_choice: 'promo' }))
    expect(choiceInput(req)).toEqual({ pool_choice: 'promo' })
    expect(choiceInput({ ...req, batchSize: 3 })).toEqual({})
    expect(choiceInput({ ...req, batchId: '00000000-0000-4000-8000-000000000001' })).toEqual({})
    expect(choiceInput({ ...req, source: 'graylum' })).toEqual({})
    expect(choiceInput(toGenerationRequest('u', body({})))).toEqual({})
  })
  it('rejects an unknown choice', () => {
    expect(generateBodySchema.safeParse({ template_id: 't', pool_choice: 'gift' }).success).toBe(false)
  })
})

describe('spendableBalance', () => {
  const db = (seat: unknown, profile: unknown) => {
    const chain = (data: unknown) => { const c = { select: () => c, eq: () => c, maybeSingle: async () => ({ data, error: null }) }; return c }
    return { from: (table: string) => chain(table === 'org_members' ? seat : profile) } as never
  }
  it("shows an active member their org shares, and anyone else their own balance", async () => {
    const { spendableBalance } = await import('./pool-choice')
    const seat = { held_credits: 30, held_promo_credits: 70, orgs: { promo_expires_at: '2999-01-01T00:00:00Z' } }
    const profile = { credits: 500, free_credits: 80, org_pool_choice: null }
    expect(await spendableBalance(db(seat, profile), 'u', { paid: 500, free: 80 })).toEqual({ paid: 30, free: 70 })
    expect(await spendableBalance(db(null, profile), 'u', { paid: 500, free: 80 })).toEqual({ paid: 500, free: 80 })
  })
})
