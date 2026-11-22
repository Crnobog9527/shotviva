import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@/core/logger', () => ({ logger: { warn: vi.fn() } }))

const { offerOf } = await import('./pool-choice')
const { chosenBalance } = await import('@/core/billing/pools')
const { choiceInput } = await import('@/core/jobs/run-generation')
const { generateBodySchema, toGenerationRequest } = await import('@/core/jobs/generation-request')

const now = new Date('2026-11-21T10:00:00Z')
const live = { orgs: { promo_expires_at: '2026-12-01T00:00:00Z' } }

// 出图时让员工自选 (ARCHITECTURE §6.5): the picker shows only when both kinds are held, mirroring _reserve_pool.
describe('offerOf', () => {
  it('offers both pools with their balances and the remembered choice', () => {
    expect(offerOf({ held_credits: 100, held_promo_credits: 40, ...live }, { credits: 120, free_credits: 60, org_pool_choice: 'promo' }, now))
      .toEqual({ paid: 120, promo: 60, last: 'promo' })
    expect(offerOf({ held_credits: 1, held_promo_credits: 1, ...live }, { credits: 1, free_credits: 1, org_pool_choice: null }, now)).toMatchObject({ last: 'paid' })
  })
  it('offers nothing with one kind only, a spent share, or the month over', () => {
    expect(offerOf({ held_credits: 0, held_promo_credits: 40, ...live }, { credits: 500, free_credits: 60, org_pool_choice: null }, now)).toBeNull()
    expect(offerOf({ held_credits: 100, held_promo_credits: 40, ...live }, { credits: 100, free_credits: 0, org_pool_choice: null }, now)).toBeNull()
    expect(offerOf({ held_credits: 100, held_promo_credits: 40, orgs: { promo_expires_at: '2026-11-01T00:00:00Z' } }, { credits: 100, free_credits: 40, org_pool_choice: null }, now)).toBeNull()
    expect(offerOf({ held_credits: 100, held_promo_credits: 40, orgs: { promo_expires_at: null } }, { credits: 100, free_credits: 40, org_pool_choice: null }, now)).toBeNull()
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
