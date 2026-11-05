import { describe, expect, it, vi } from 'vitest'

import { grantSignupCredits, signupGrantKey, supabaseGrantCredits, type GrantCredits } from './free-credits'

describe('grantSignupCredits', () => {
  it('grants the configured amount once per user via the signup idempotency key', async () => {
    const grant = vi.fn<GrantCredits>().mockResolvedValue()
    await grantSignupCredits(grant, 'u1', 3)
    await grantSignupCredits(grant, 'u1', 3)
    expect(grant).toHaveBeenCalledWith({ userId: 'u1', amount: 3, reason: 'signup', idempotencyKey: 'signup:u1' })
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

describe('supabaseGrantCredits', () => {
  it('calls the grant_credits SQL function with T2 parameter names', async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null })
    const grant = supabaseGrantCredits({ rpc } as never)
    await grant({ userId: 'u1', amount: 3, reason: 'signup', idempotencyKey: signupGrantKey('u1') })
    expect(rpc).toHaveBeenCalledWith('grant_credits', {
      p_user_id: 'u1',
      p_amount: 3,
      p_reason: 'signup',
      p_idempotency_key: 'signup:u1',
    })
  })

  it('throws on an rpc error so the caller can log it', async () => {
    const rpc = vi.fn().mockResolvedValue({ error: { code: 'P0001' } })
    await expect(supabaseGrantCredits({ rpc } as never)({ userId: 'u', amount: 1, reason: 'r', idempotencyKey: 'k' })).rejects.toThrow(
      /P0001/,
    )
  })
})
