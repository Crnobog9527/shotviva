import { describe, expect, it, vi } from 'vitest'

import { AppError } from '@/core/errors'

import { saveFeatureAccess, type FeatureAccessDeps } from './commands'

// /admin/features save (ARCHITECTURE §6.2): registry keys only, one RPC, cache expired after.

const registry = [{ key: 'studio_video', name: '视频工作室' }]

function deps() {
  const rpc = vi.fn(async () => ({ data: null, error: null }))
  const invalidate = vi.fn()
  return { rpc, invalidate, deps: { db: { rpc }, invalidate, registry } satisfies FeatureAccessDeps }
}

describe('saveFeatureAccess', () => {
  it('writes the gate with the admin as updated_by, then expires the features cache', async () => {
    const d = deps()
    await saveFeatureAccess(d.deps, 'admin-1', { key: 'studio_video', minTier: 'max', openToAllAt: '2026-12-01T00:00:00.000Z' })
    expect(d.rpc).toHaveBeenCalledWith('admin_set_feature_access', {
      p_key: 'studio_video',
      p_min_tier: 'max',
      p_open_to_all_at: '2026-12-01T00:00:00.000Z',
      p_actor: 'admin-1',
    })
    expect(d.invalidate).toHaveBeenCalledOnce()
    expect(d.invalidate.mock.invocationCallOrder[0]).toBeGreaterThan(d.rpc.mock.invocationCallOrder[0])
  })

  it('refuses a key that is not in the registry without touching the database or the cache', async () => {
    const d = deps()
    const error = await saveFeatureAccess(d.deps, 'admin-1', { key: 'not_registered', minTier: 'max', openToAllAt: null }).catch(
      (e: unknown) => e,
    )
    expect(error).toBeInstanceOf(AppError)
    expect((error as AppError).code).toBe('INVALID_INPUT')
    expect(d.rpc).not.toHaveBeenCalled()
    expect(d.invalidate).not.toHaveBeenCalled()
  })

  it.each([
    { key: 'studio_video', minTier: 'starter', openToAllAt: null },
    { key: 'studio_video', minTier: 'max', openToAllAt: 'tomorrow' },
    { key: 'studio_video' },
  ])('refuses malformed input %o', async (input) => {
    const d = deps()
    await expect(saveFeatureAccess(d.deps, 'admin-1', input)).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    expect(d.rpc).not.toHaveBeenCalled()
  })

  it('drops the opening date when everyone may already use the feature', async () => {
    const d = deps()
    await saveFeatureAccess(d.deps, 'admin-1', { key: 'studio_video', minTier: null, openToAllAt: '2026-12-01T00:00:00Z' })
    expect(d.rpc).toHaveBeenCalledWith('admin_set_feature_access', expect.objectContaining({ p_min_tier: null, p_open_to_all_at: null }))
  })

  it('does not expire the cache when the write fails', async () => {
    const d = deps()
    d.rpc.mockResolvedValueOnce({ data: null, error: { message: 'boom' } } as never)
    await expect(
      saveFeatureAccess(d.deps, 'admin-1', { key: 'studio_video', minTier: 'pro', openToAllAt: null }),
    ).rejects.toMatchObject({ code: 'INTERNAL' })
    expect(d.invalidate).not.toHaveBeenCalled()
  })
})
