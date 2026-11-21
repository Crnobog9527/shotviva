import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ getSessionUser: vi.fn() }))

vi.mock('@/core/auth/session', () => ({ getSessionUser: mocks.getSessionUser }))
vi.mock('@/core/storage/r2-store', () => ({
  r2Store: () => ({ presignPut: async (key: string, _type: string, ttl: number) => `https://r2.example/${key}?ttl=${ttl}` }),
}))

const { POST } = await import('./route')

const ORIGIN = 'http://localhost:3000'
const USER = '0b6f3f0e-5d1c-4c47-9a49-6a3f6f8d2e11'
const request = (body: unknown, origin = ORIGIN) =>
  new NextRequest(`${ORIGIN}/api/uploads/batch`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin },
    body: JSON.stringify(body),
  })

describe('POST /api/uploads/batch', () => {
  beforeEach(() => {
    mocks.getSessionUser.mockResolvedValue({ id: USER, email: null, role: 'user', verified: true, banned: false })
  })

  it('hands out distinct server-chosen keys under the caller’s inputs/, signed for five minutes', async () => {
    const response = await POST(request({ content_type: 'image/jpeg', count: 10 }))
    expect(response.status).toBe(200)
    const { tickets } = (await response.json()) as { tickets: { input_key: string; put_url: string; expires_in: number }[] }
    expect(tickets).toHaveLength(10)
    expect(new Set(tickets.map((t) => t.input_key)).size).toBe(10)
    for (const ticket of tickets) {
      expect(ticket.input_key.startsWith(`inputs/${USER}/`)).toBe(true)
      expect(ticket.put_url).toBe(`https://r2.example/${ticket.input_key}?ttl=300`)
      expect(ticket.expires_in).toBe(300)
    }
  })

  it('refuses more than ten, zero, other types, other origins and anonymous callers', async () => {
    expect((await POST(request({ content_type: 'image/jpeg', count: 11 }))).status).toBe(422)
    expect((await POST(request({ content_type: 'image/jpeg', count: 0 }))).status).toBe(422)
    expect((await POST(request({ content_type: 'image/heic', count: 1 }))).status).toBe(422)
    expect((await POST(request({ content_type: 'image/jpeg', count: 1 }, 'https://evil.example'))).status).toBe(403)
    mocks.getSessionUser.mockResolvedValueOnce(null)
    expect((await POST(request({ content_type: 'image/jpeg', count: 1 }))).status).toBe(401)
  })
})
