import { describe, expect, it, vi } from 'vitest'

import { AppError } from '@/core/errors'

import type { SystemSettingDeps } from './commands'
import { loadSignupLimits, saveSignupLimits } from './signup-limits'

// 2027: the per-IP sign-up and SMS limits on /admin/features. One RPC per limit (the database
// checks the admin, the key and the range again), then the settings cache.

function deps() {
  const rpc = vi.fn(async () => ({ data: null, error: null }))
  const invalidate = vi.fn()
  return { rpc, invalidate, deps: { db: { rpc }, invalidate } satisfies SystemSettingDeps }
}

const limits = { signupHourly: 5, signupDaily: 20, signupHourlyPartner: 20, signupDailyPartner: 100, smsDaily: 50, smsDailyPartner: 200 }

describe('saveSignupLimits', () => {
  it('saves every limit with its own key, the admin as actor', async () => {
    const d = deps()
    await saveSignupLimits(d.deps, 'admin-1', limits)
    expect(d.rpc.mock.calls).toEqual([
      ['admin_set_system_setting', { p_key: 'signup_request_ip_hourly', p_value: 5, p_actor: 'admin-1' }],
      ['admin_set_system_setting', { p_key: 'signup_request_ip_daily', p_value: 20, p_actor: 'admin-1' }],
      ['admin_set_system_setting', { p_key: 'signup_request_ip_hourly_partner', p_value: 20, p_actor: 'admin-1' }],
      ['admin_set_system_setting', { p_key: 'signup_request_ip_daily_partner', p_value: 100, p_actor: 'admin-1' }],
      ['admin_set_system_setting', { p_key: 'sms_ip_daily', p_value: 50, p_actor: 'admin-1' }],
      ['admin_set_system_setting', { p_key: 'sms_ip_daily_partner', p_value: 200, p_actor: 'admin-1' }],
    ])
    expect(d.invalidate).toHaveBeenCalledOnce()
  })

  it.each([1, 10_000])('accepts a limit at its bounds (%s)', async (value) => {
    const d = deps()
    await saveSignupLimits(d.deps, 'admin-1', { ...limits, smsDaily: value })
    expect(d.rpc).toHaveBeenCalledTimes(6)
  })

  it.each([
    { ...limits, signupHourly: 0 },
    { ...limits, signupDaily: 10_001 },
    { ...limits, smsDaily: 2.5 },
    { ...limits, smsDailyPartner: '200' },
    { ...limits, signupDailyPartner: -1 },
    { signupHourly: 5, signupDaily: 20 },
    null,
  ])('refuses %o without touching the database', async (input) => {
    const d = deps()
    const error = await saveSignupLimits(d.deps, 'admin-1', input).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(AppError)
    expect(d.rpc).not.toHaveBeenCalled()
  })
})

describe('loadSignupLimits', () => {
  it('maps signup_ip_limits() onto the card', async () => {
    const data = { signup_hourly: 5, signup_daily: 20, signup_hourly_partner: 20, signup_daily_partner: 100, sms_daily: 50, sms_daily_partner: 200 }
    const db = { rpc: async () => ({ data, error: null }) } as unknown as Parameters<typeof loadSignupLimits>[0]
    expect(await loadSignupLimits(db)).toEqual(limits)
  })
})
