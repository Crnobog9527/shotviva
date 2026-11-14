import { beforeEach, describe, expect, it, vi } from 'vitest'

import { benefits } from '../../../../tests/t94-config'

const mocks = vi.hoisted(() => ({ onVerifiedSignIn: vi.fn() }))
vi.mock('../first-sign-in', () => ({ onVerifiedSignIn: mocks.onVerifiedSignIn }))

const { landOnSession } = await import('./landing')

const GOOGLE = { id: 'g1', email_confirmed_at: null, app_metadata: { provider: 'google' }, user_metadata: {} }

function client(user: object) {
  const updateUser = vi.fn().mockResolvedValue({ data: {}, error: null })
  const supabase = { auth: { getUser: vi.fn().mockResolvedValue({ data: { user } }), updateUser } }
  return { supabase: supabase as unknown as Parameters<typeof landOnSession>[0], updateUser }
}

describe('landOnSession: account language (ARCHITECTURE §7)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('stores the language a Google sign-in started in, so its emails follow it', async () => {
    const { supabase, updateUser } = client(GOOGLE)
    await landOnSession(supabase, 'oauth', benefits, '/zh/account')
    expect(updateUser).toHaveBeenCalledExactlyOnceWith({ data: { locale: 'zh' } })
    expect(mocks.onVerifiedSignIn).toHaveBeenCalledWith('g1', benefits, 'google', 'zh')
  })

  it('never overwrites a language the account already has', async () => {
    const { supabase, updateUser } = client({ ...GOOGLE, user_metadata: { locale: 'en' } })
    await landOnSession(supabase, 'oauth', benefits, '/zh/account')
    expect(updateUser).not.toHaveBeenCalled()
    expect(mocks.onVerifiedSignIn).toHaveBeenCalledWith('g1', benefits, 'google', 'en')
  })

  it('leaves email links alone: sign-up wrote the language already', async () => {
    const { supabase, updateUser } = client({ ...GOOGLE, app_metadata: { provider: 'email' }, email_confirmed_at: '2026-11-06T00:00:00Z' })
    await landOnSession(supabase, 'email', benefits, '/zh/account')
    expect(updateUser).not.toHaveBeenCalled()
  })
})
