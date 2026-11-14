import { describe, expect, it } from 'vitest'

import { activationQuery, loadActivation } from './activation'
import { fakeRun, WEEK } from './test-samples'

describe('新用户激活', () => {
  it('follows each sign-up of either period up to now, counting only succeeded free-pool images toward the gift', () => {
    const { query } = activationQuery(WEEK, 6)
    expect(query).toContain("HAVING countIf(event = 'signup') > 0")
    expect(query).toContain("properties.credit_pool = 'free'")
    expect(query).toContain('countIf(free_credits >= 6)')
    expect(query).toContain("dateDiff('second', signed_at, first_image) <= 86400")
    expect(query).not.toContain(`timestamp < toDateTime('${WEEK.end}')`)
  })

  it('turns the recorded answer into rates and hours', async () => {
    const activation = await loadActivation(fakeRun(), WEEK, 6)
    expect(activation.current).toEqual({
      signups: 144,
      active24hRate: 90 / 144,
      hoursToImage: 1.5,
      hoursToPaid: 72,
      usedGift: 61,
      paidAfterGiftRate: 14 / 61,
    })
    expect(activation.previous).toMatchObject({ signups: 120, hoursToImage: 2, hoursToPaid: null })
  })

  it('reads an empty answer as nobody signed up', async () => {
    const empty = { results: [], columns: ['cur', 'signups'] }
    const activation = await loadActivation(fakeRun({ activation: empty }), WEEK, 6)
    expect(activation.current).toEqual({ signups: 0, active24hRate: null, hoursToImage: null, hoursToPaid: null, usedGift: 0, paidAfterGiftRate: null })
  })
})
