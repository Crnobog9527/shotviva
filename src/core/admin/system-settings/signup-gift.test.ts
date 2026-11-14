import { describe, expect, it, vi } from 'vitest'

import { AppError } from '@/core/errors'

import type { SystemSettingDeps } from './commands'
import { saveSignupGiftRules } from './signup-gift'

// 1350 + 1480: the signup gift's rules on /admin/features. One RPC per rule (the database checks
// the admin, the key and the range again), then the settings cache.

function deps() {
  const rpc = vi.fn(async () => ({ data: null, error: null }))
  const invalidate = vi.fn()
  return { rpc, invalidate, deps: { db: { rpc }, invalidate } satisfies SystemSettingDeps }
}

const rules = { cap: 30, perIp: 5, claimPhone: true, claimGoogle: false }

describe('saveSignupGiftRules', () => {
  it('saves every rule with its own key and type, the admin as actor', async () => {
    const d = deps()
    await saveSignupGiftRules(d.deps, 'admin-1', rules)
    expect(d.rpc.mock.calls).toEqual([
      ['admin_set_system_setting', { p_key: 'signup_gift_daily_cap', p_value: 30, p_actor: 'admin-1' }],
      ['admin_set_system_setting', { p_key: 'signup_gift_per_ip', p_value: 5, p_actor: 'admin-1' }],
      ['admin_set_system_setting', { p_key: 'signup_gift_claim_phone', p_value: true, p_actor: 'admin-1' }],
      ['admin_set_system_setting', { p_key: 'signup_gift_claim_google', p_value: false, p_actor: 'admin-1' }],
    ])
    expect(d.invalidate).toHaveBeenCalledOnce()
  })

  it.each([0, 100_000])('accepts the cap at its bounds (%s)', async (cap) => {
    const d = deps()
    await saveSignupGiftRules(d.deps, 'admin-1', { ...rules, cap, perIp: cap === 0 ? 0 : 1000 })
    expect(d.rpc).toHaveBeenCalledTimes(4)
  })

  it.each([
    { ...rules, cap: -1 },
    { ...rules, cap: 1.5 },
    { ...rules, cap: 100_001 },
    { ...rules, perIp: 1001 },
    { ...rules, perIp: -1 },
    { ...rules, claimPhone: 'yes' },
    { cap: 30 },
    null,
  ])('refuses %o without touching the database', async (input) => {
    const d = deps()
    const error = await saveSignupGiftRules(d.deps, 'admin-1', input).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(AppError)
    expect(d.rpc).not.toHaveBeenCalled()
  })
})
