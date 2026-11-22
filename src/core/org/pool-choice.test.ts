import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@/core/logger', () => ({ logger: { warn: vi.fn() } }))

const { offerOf } = await import('./pool-choice')
const { bothKinds, chosenBalance, orgBalance } = await import('@/core/billing/pools')
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
  it('shows the picker only with both kinds', () => {
    expect(bothKinds({ paid: 1, promo: 1, last: 'paid' })).toBe(true)
    expect(bothKinds({ paid: 0, promo: 9, last: 'paid' })).toBe(false)
    expect(orgBalance({ paid: 3, promo: 4, last: 'paid' })).toEqual({ paid: 3, free: 4 })
  })
})

describe('chosenBalance', () => {
  it('lets the chosen kind pay from its own pool only', () => {
    expect(chosenBalance({ paid: 30, free: 70 }, 'paid')).toEqual({ paid: 30, free: 0 })
    expect(chosenBalance({ paid: 30, free: 70 }, 'promo')).toEqual({ paid: 0, free: 70 })
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
