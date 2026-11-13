import { describe, expect, it, vi } from 'vitest'

import { AppError } from '@/core/errors'

import type { SystemSettingDeps } from './commands'
import { saveSignupGiftCap } from './signup-gift'

// 1350: the signup gift's daily cap on /admin/features. One RPC (the database checks the admin,
// the key and the range again), then the settings cache.

function deps() {
  const rpc = vi.fn(async () => ({ data: null, error: null }))
  const invalidate = vi.fn()
  return { rpc, invalidate, deps: { db: { rpc }, invalidate } satisfies SystemSettingDeps }
}

describe('saveSignupGiftCap', () => {
  it.each([0, 30, 100_000])('saves cap=%s as a number with the admin as actor', async (cap) => {
    const d = deps()
    await saveSignupGiftCap(d.deps, 'admin-1', { cap })
    expect(d.rpc).toHaveBeenCalledWith('admin_set_system_setting', { p_key: 'signup_gift_daily_cap', p_value: cap, p_actor: 'admin-1' })
    expect(d.invalidate).toHaveBeenCalledOnce()
  })

  it.each([{ cap: -1 }, { cap: 1.5 }, { cap: 100_001 }, { cap: '30' }, {}, null])('refuses %o without touching the database', async (input) => {
    const d = deps()
    const error = await saveSignupGiftCap(d.deps, 'admin-1', input).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(AppError)
    expect(d.rpc).not.toHaveBeenCalled()
  })
})
