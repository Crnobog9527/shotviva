import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getSessionUser: vi.fn(),
  site: { features: { wishlist: true } },
  createRequest: vi.fn(),
  toggleVote: vi.fn(),
}))

vi.mock('@/core/auth/session', () => ({ getSessionUser: mocks.getSessionUser }))
vi.mock('@/core/auth/supabase-admin', () => ({ createAdminSupabase: () => ({}) }))
vi.mock('@/core/storage/r2-store', () => ({ r2Store: () => ({}) }))
vi.mock('@/site/site.config', () => ({ site: mocks.site }))
vi.mock('@/core/wishlist/requests', () => ({ createRequest: mocks.createRequest, toggleVote: mocks.toggleVote }))

const { POST: postRequest } = await import('./route')
const { POST: postVote } = await import('./[id]/vote/route')

const ORIGIN = 'http://localhost:3000'
const USER = { id: '0b6f3f0e-5d1c-4c47-9a49-6a3f6f8d2e11', email: null, role: 'user', emailVerified: true, banned: false }
const REQUEST_ID = '7d1e2c3b-0000-4000-8000-000000000000'
const post = (path: string, body: unknown = {}, origin = ORIGIN) =>
  new NextRequest(`${ORIGIN}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin },
    body: JSON.stringify(body),
  })
const vote = (origin = ORIGIN) =>
  postVote(post(`/api/wishlist/requests/${REQUEST_ID}/vote`, {}, origin), { params: Promise.resolve({ id: REQUEST_ID }) })

describe('/api/wishlist routes', () => {
  beforeEach(() => {
    mocks.site.features.wishlist = true
    mocks.getSessionUser.mockReset().mockResolvedValue(USER)
    mocks.createRequest.mockReset().mockResolvedValue({ id: REQUEST_ID, status: 'pending' })
    mocks.toggleVote.mockReset().mockResolvedValue({ voted: true, votesCount: 1 })
  })

  it('404s both routes while the wishlist is switched off (ARCHITECTURE §15.6)', async () => {
    mocks.site.features.wishlist = false
    expect((await postRequest(post('/api/wishlist/requests'))).status).toBe(404)
    expect((await vote()).status).toBe(404)
    expect(mocks.createRequest).not.toHaveBeenCalled()
    expect(mocks.toggleVote).not.toHaveBeenCalled()
  })

  it('creates a pending request for the signed-in user', async () => {
    const body = { description: 'Brunch poster', input_keys: ['k'] }
    const response = await postRequest(post('/api/wishlist/requests', body))
    expect(response.status).toBe(201)
    expect(await response.json()).toEqual({ id: REQUEST_ID, status: 'pending' })
    expect(mocks.createRequest).toHaveBeenCalledWith(expect.anything(), USER.id, body)
  })

  it('toggles the caller’s vote', async () => {
    const response = await vote()
    expect(await response.json()).toEqual({ voted: true, votesCount: 1 })
    expect(mocks.toggleVote).toHaveBeenCalledWith(expect.anything(), USER.id, REQUEST_ID)
  })

  it('rejects other origins and anonymous callers', async () => {
    expect((await postRequest(post('/api/wishlist/requests', {}, 'https://evil.example'))).status).toBe(403)
    expect((await vote('https://evil.example')).status).toBe(403)
    mocks.getSessionUser.mockResolvedValue(null)
    expect((await postRequest(post('/api/wishlist/requests'))).status).toBe(401)
    expect((await vote()).status).toBe(401)
  })
})
