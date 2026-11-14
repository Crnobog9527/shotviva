import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ getSessionUser: vi.fn() }))

vi.mock('@/core/auth/session', () => ({ getSessionUser: mocks.getSessionUser }))
vi.mock('@/core/storage/r2-store', () => ({
  r2Store: () => ({ presignPut: async (key: string) => `https://r2.example/${key}?signed` }),
}))

const { POST } = await import('./route')

const ORIGIN = 'http://localhost:3000'
const request = (body: unknown, origin = ORIGIN) =>
  new NextRequest(`${ORIGIN}/api/uploads`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin },
    body: JSON.stringify(body),
  })

describe('POST /api/uploads', () => {
  beforeEach(() => {
    mocks.getSessionUser.mockResolvedValue({ id: '0b6f3f0e-5d1c-4c47-9a49-6a3f6f8d2e11', email: null, role: 'user', verified: true, banned: false })
  })

  it('returns a presigned PUT and never takes image bytes', async () => {
    const response = await POST(request({ content_type: 'image/jpeg', size: 1_000_000 }))
    expect(response.status).toBe(200)
    const body = (await response.json()) as { input_key: string; put_url: string }
    expect(body.put_url).toBe(`https://r2.example/${body.input_key}?signed`)
  })

  it('rejects other origins, anonymous and unverified users', async () => {
    expect((await POST(request({ content_type: 'image/jpeg', size: 1 }, 'https://evil.example'))).status).toBe(403)
    mocks.getSessionUser.mockResolvedValueOnce(null)
    expect((await POST(request({ content_type: 'image/jpeg', size: 1 }))).status).toBe(401)
    mocks.getSessionUser.mockResolvedValueOnce({ id: 'x', email: null, role: 'user', verified: false, banned: false })
    expect((await POST(request({ content_type: 'image/jpeg', size: 1 }))).status).toBe(403)
  })

  it('answers 422 for HEIC and oversize requests', async () => {
    expect((await POST(request({ content_type: 'image/heic', size: 1 }))).status).toBe(422)
    expect((await POST(request({ content_type: 'image/jpeg', size: 30 * 1024 * 1024 }))).status).toBe(422)
  })
})
