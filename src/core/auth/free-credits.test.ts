import { describe, expect, it, vi } from 'vitest'

import { billingGrant, grantSignupCredits, type GrantCredits } from './free-credits'

describe('grantSignupCredits', () => {
  it('grants the configured amount once per user via the signup idempotency key', async () => {
    const grant = vi.fn<GrantCredits>().mockResolvedValue(undefined)
    await grantSignupCredits(grant, 'u1', 3)
    await grantSignupCredits(grant, 'u1', 3)
    expect(grant).toHaveBeenCalledWith({ userId: 'u1', amount: 3, reason: 'signup', idempotencyKey: 'signup:u1', pool: 'free' })
    // Both calls carry the same key; grant_credits (T2) settles the second as a no-op.
    expect(new Set(grant.mock.calls.map(([input]) => input.idempotencyKey)).size).toBe(1)
  })

  it('skips a zero amount and never throws when the grant fails', async () => {
    const grant = vi.fn<GrantCredits>().mockRejectedValue(new Error('db down'))
    await grantSignupCredits(grant, 'u1', 0)
    expect(grant).not.toHaveBeenCalled()
    await expect(grantSignupCredits(grant, 'u1', 3)).resolves.toBeUndefined()
  })
})

describe('billingGrant', () => {
  it('calls core/billing grant_credits with the free pool', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { applied: true, credits: 0, free_credits: 3, paid_until: null }, error: null })
    const id = '00000000-0000-4000-8000-000000000001'
    await billingGrant({ rpc })({ userId: id, amount: 3, reason: 'signup', idempotencyKey: `signup:${id}`, pool: 'free' })
    expect(rpc).toHaveBeenCalledWith('grant_credits', {
      p_user_id: id,
      p_amount: 3,
      p_reason: 'signup',
      p_idempotency_key: `signup:${id}`,
      p_pool: 'free',
    })
  })
})
