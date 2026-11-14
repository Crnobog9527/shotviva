import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  site: { features: { wishlist: true } },
  settings: vi.fn(),
  getSessionUser: vi.fn(),
  rpc: vi.fn(),
  revalidateTag: vi.fn(),
}))

vi.mock('@/site/site.config', () => ({ site: mocks.site }))
vi.mock('@/core/system-settings/read', () => ({ cachedSystemSettings: mocks.settings, SYSTEM_SETTINGS_CACHE_TAG: 'system-settings' }))
vi.mock('@/core/auth/session', () => ({ getSessionUser: mocks.getSessionUser }))
vi.mock('@/core/auth/supabase-admin', () => ({ createAdminSupabase: () => ({ rpc: mocks.rpc }) }))
vi.mock('next/cache', () => ({ cacheLife: vi.fn(), cacheTag: vi.fn(), revalidateTag: mocks.revalidateTag }))

const { POST } = await import('./route')

const ORIGIN = 'http://localhost:3000'
const USER = { id: '0b6f3f0e-5d1c-4c47-9a49-6a3f6f8d2e11', verified: true }
const SHOWN = '00000000-0000-4000-8000-000000000106'
const post = (body: unknown, origin = ORIGIN) =>
  POST(new NextRequest(`${ORIGIN}/api/wishlist/notices/seen`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  }))

describe('POST /api/wishlist/notices/seen', () => {
  beforeEach(() => {
    mocks.site.features.wishlist = true
    mocks.settings.mockReset().mockResolvedValue({ wishlist_enabled: true })
    mocks.getSessionUser.mockReset().mockResolvedValue(USER)
    mocks.rpc.mockReset().mockResolvedValue({ data: null })
    mocks.revalidateTag.mockReset()
  })

  it('marks the shown notices for the session user and expires only their cache', async () => {
    const response = await post({ ids: [SHOWN] })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true })
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith('mark_wish_notices_seen', { p_user_id: USER.id, p_request_ids: [SHOWN] })
    expect(mocks.revalidateTag).toHaveBeenCalledExactlyOnceWith(`wish-notices:${USER.id}`, { expire: 0 })
  })

  it('rejects other origins before touching the session', async () => {
    expect((await post({ ids: [SHOWN] }, 'https://evil.example')).status).toBe(403)
    expect(mocks.getSessionUser).not.toHaveBeenCalled()
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it.each([null, { ...USER, verified: false }])('does nothing without a verified session', async (viewer) => {
    mocks.getSessionUser.mockResolvedValue(viewer)
    expect((await post({ ids: [SHOWN] })).status).toBe(200)
    expect(mocks.rpc).not.toHaveBeenCalled()
    expect(mocks.revalidateTag).not.toHaveBeenCalled()
  })

  it('404s while the wishlist is off, and writes nothing while the admin switch is off', async () => {
    mocks.site.features.wishlist = false
    expect((await post({ ids: [SHOWN] })).status).toBe(404)
    mocks.site.features.wishlist = true
    mocks.settings.mockResolvedValue({ wishlist_enabled: false })
    await post({ ids: [SHOWN] })
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('refuses malformed or oversized lists', async () => {
    const six = Array.from({ length: 6 }, () => SHOWN)
    for (const bad of [{ ids: six }, { ids: 'nope' }, { ids: [42] }, [SHOWN], 'not json', { ids: ['not-a-uuid'] }]) {
      const response = await post(bad)
      expect(response.status).toBe(422)
      expect(await response.json()).toMatchObject({ code: 'INVALID_INPUT' })
    }
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
})
