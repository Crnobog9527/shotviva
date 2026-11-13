import { describe, expect, it, vi } from 'vitest'

import { setFeatureInvite } from './invites'

// /admin/features invites (1343): invite-only features only; the database resolves the account.

const registry = [{ key: 'beta_posters', name: '内测', inviteOnly: true }, { key: 'studio_video', name: '视频' }]
const USER = '0b4b8a8e-9a7e-4a6f-9d5e-7b1c2d3e4f50'

function rpcReturning(result: { data: unknown; error: { message: string } | null }) {
  const rpc = vi.fn(async () => result)
  return { rpc, deps: { db: { rpc }, registry } }
}

describe('setFeatureInvite', () => {
  it('sends the admin, the feature, the trimmed account and the choice', async () => {
    const d = rpcReturning({ data: USER, error: null })
    await setFeatureInvite(d.deps, 'admin-1', { key: 'beta_posters', account: '  friend@example.com ', invited: true })
    expect(d.rpc).toHaveBeenCalledWith('admin_set_feature_grant', {
      p_actor: 'admin-1', p_key: 'beta_posters', p_account: 'friend@example.com', p_granted: true,
    })
  })

  it('refuses a feature that is not invite-only, before the database', async () => {
    const d = rpcReturning({ data: USER, error: null })
    await expect(setFeatureInvite(d.deps, 'admin-1', { key: 'studio_video', account: 'a@b.co', invited: true }))
      .rejects.toMatchObject({ code: 'INVALID_INPUT' })
    expect(d.rpc).not.toHaveBeenCalled()
  })

  it('says plainly when no account has that email or phone', async () => {
    const d = rpcReturning({ data: null, error: { message: 'PROFILE_NOT_FOUND' } })
    await expect(setFeatureInvite(d.deps, 'admin-1', { key: 'beta_posters', account: '13800000000', invited: true }))
      .rejects.toMatchObject({ code: 'NOT_FOUND', message: expect.stringContaining('找不到') })
  })
})
