import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const spies = vi.hoisted(() => ({ user: vi.fn() }))
vi.mock('server-only', () => ({}))
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined, delete: () => undefined }) }))
vi.mock('../auth', async () => {
  const target = await import('../auth/redirect-target')
  return { getSessionUser: spies.user, signupPath: target.signupPath }
})

const { handleJoinIntent, JOIN_INTENT_COOKIE, shouldAutoJoin } = await import('./join-intent')

const TOKEN = 'a'.repeat(32)
const OTHER = 'b'.repeat(32)
const request = (locale = 'zh') => new NextRequest(`https://shotviva.com/api/join/org/${TOKEN}?locale=${locale}`)

// Review of #829 (P1): `?auto=1` from a link must never join a signed-in account by itself.
describe('shouldAutoJoin', () => {
  it('does not join a signed-in visit with ?auto=1 and no matching mark', () => {
    expect(shouldAutoJoin({ auto: '1', cookie: undefined, token: TOKEN })).toBe(false)
    expect(shouldAutoJoin({ auto: '1', cookie: OTHER, token: TOKEN })).toBe(false)
  })

  it('joins only with ?auto=1 and the mark for this very token', () => {
    expect(shouldAutoJoin({ auto: '1', cookie: TOKEN, token: TOKEN })).toBe(true)
    expect(shouldAutoJoin({ auto: undefined, cookie: TOKEN, token: TOKEN })).toBe(false)
    expect(shouldAutoJoin({ auto: ['1'], cookie: TOKEN, token: TOKEN })).toBe(false)
    expect(shouldAutoJoin({ auto: '1', cookie: 'x', token: 'x' })).toBe(false)
  })
})

describe('the join-intent route', () => {
  beforeEach(() => spies.user.mockReset())

  it('marks a signed-out visitor and sends them to sign-up with the page as next', async () => {
    spies.user.mockResolvedValue(null)
    const response = await handleJoinIntent(request(), TOKEN)
    expect(response.headers.get('location')).toBe(`https://shotviva.com/zh/signup?next=${encodeURIComponent(`/zh/join/org/${TOKEN}?auto=1`)}`)
    const cookie = response.cookies.get(JOIN_INTENT_COOKIE)
    expect(cookie).toMatchObject({ value: TOKEN, httpOnly: true, sameSite: 'lax', secure: true, path: '/' })
  })

  it('never marks a signed-in visitor: back to the page, which shows its confirm button', async () => {
    spies.user.mockResolvedValue({ id: 'u', verified: true })
    const response = await handleJoinIntent(request('en'), TOKEN)
    expect(response.headers.get('location')).toBe(`https://shotviva.com/join/org/${TOKEN}`)
    expect(response.cookies.get(JOIN_INTENT_COOKIE)).toBeUndefined()
  })

  it('never marks when the session check fails or the token is malformed', async () => {
    spies.user.mockRejectedValue(new Error('AUTH_UNAVAILABLE'))
    expect((await handleJoinIntent(request(), TOKEN)).cookies.get(JOIN_INTENT_COOKIE)).toBeUndefined()
    spies.user.mockResolvedValue(null)
    expect((await handleJoinIntent(request(), 'not-a-token')).cookies.get(JOIN_INTENT_COOKIE)).toBeUndefined()
  })
})
