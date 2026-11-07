import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AppError } from '@/core/errors'

const mocks = vi.hoisted(() => ({
  getSessionUser: vi.fn(),
  setFavorite: vi.fn(),
  session: { kind: 'user-session' },
}))

vi.mock('@/core/auth/session', () => ({ getSessionUser: mocks.getSessionUser }))
vi.mock('@/core/auth/supabase-server', () => ({ createServerSupabase: async () => mocks.session }))
vi.mock('@/core/favorites/repository', () => ({ setFavorite: mocks.setFavorite, listFavoriteIds: vi.fn() }))

const { PUT, DELETE } = await import('./route')

const ORIGIN = 'http://localhost:3000'
const USER = { id: '0b6f3f0e-5d1c-4c47-9a49-6a3f6f8d2e11', email: null, role: 'user', verified: true, banned: false }
const call = (handler: typeof PUT, method: 'PUT' | 'DELETE', origin = ORIGIN, templateId = 'pure-white') =>
  handler(new NextRequest(`${ORIGIN}/api/favorites/${templateId}`, { method, headers: { origin } }), {
    params: Promise.resolve({ templateId }),
  })

describe('/api/favorites/[templateId] (ARCHITECTURE §5.1b)', () => {
  beforeEach(() => {
    mocks.getSessionUser.mockReset().mockResolvedValue(USER)
    mocks.setFavorite.mockReset().mockImplementation(async (_client, _user, _id, saved: boolean) => ({ saved }))
  })

  it('saves with PUT and removes with DELETE, on the caller’s own session', async () => {
    const saved = await call(PUT, 'PUT')
    expect(saved.status).toBe(200)
    expect(await saved.json()).toEqual({ saved: true })
    expect(saved.headers.get('cache-control')).toContain('no-store')
    expect(mocks.setFavorite).toHaveBeenLastCalledWith(mocks.session, USER.id, 'pure-white', true)

    const removed = await call(DELETE, 'DELETE')
    expect(await removed.json()).toEqual({ saved: false })
    expect(mocks.setFavorite).toHaveBeenLastCalledWith(mocks.session, USER.id, 'pure-white', false)
  })

  it('answers the cap as FAVORITES_LIMIT (409)', async () => {
    mocks.setFavorite.mockRejectedValue(new AppError('FAVORITES_LIMIT', 'Up to 200 saved templates'))
    const response = await call(PUT, 'PUT')
    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ code: 'FAVORITES_LIMIT' })
  })

  it('rejects other origins, signed-out and unverified callers before touching the database', async () => {
    expect((await call(PUT, 'PUT', 'https://evil.example')).status).toBe(403)
    mocks.getSessionUser.mockResolvedValue(null)
    expect((await call(PUT, 'PUT')).status).toBe(401)
    mocks.getSessionUser.mockResolvedValue({ ...USER, verified: false })
    expect((await call(DELETE, 'DELETE')).status).toBe(403)
    expect(mocks.setFavorite).not.toHaveBeenCalled()
  })
})
