import { describe, expect, it, vi } from 'vitest'

import { AppError } from '@/core/errors'

import { saveWishlistSwitch, type SystemSettingDeps } from './commands'

// /admin/features 需求墙 switch (ARCHITECTURE §15.6, T62): one RPC, then the cache tag.

function deps() {
  const rpc = vi.fn(async () => ({ data: null, error: null }))
  const invalidate = vi.fn()
  return { rpc, invalidate, deps: { db: { rpc }, invalidate } satisfies SystemSettingDeps }
}

describe('saveWishlistSwitch', () => {
  it.each([true, false])('saves enabled=%s with the admin as actor, then expires the settings cache', async (enabled) => {
    const d = deps()
    await saveWishlistSwitch(d.deps, 'admin-1', { enabled })
    expect(d.rpc).toHaveBeenCalledWith('admin_set_system_setting', { p_key: 'wishlist_enabled', p_value: enabled, p_actor: 'admin-1' })
    expect(d.invalidate).toHaveBeenCalledOnce()
    expect(d.invalidate.mock.invocationCallOrder[0]).toBeGreaterThan(d.rpc.mock.invocationCallOrder[0])
  })

  it.each([{}, { enabled: 'true' }, { enabled: 1 }, null])('refuses malformed input %o without touching the database', async (input) => {
    const d = deps()
    const error = await saveWishlistSwitch(d.deps, 'admin-1', input).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(AppError)
    expect((error as AppError).code).toBe('INVALID_INPUT')
    expect(d.rpc).not.toHaveBeenCalled()
    expect(d.invalidate).not.toHaveBeenCalled()
  })

  it('a non-admin actor is refused by the database and the cache is left alone', async () => {
    const d = deps()
    d.rpc.mockResolvedValueOnce({ data: null, error: { message: 'NOT_ADMIN' } } as never)
    await expect(saveWishlistSwitch(d.deps, 'user-1', { enabled: true })).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect(d.invalidate).not.toHaveBeenCalled()
  })
})
