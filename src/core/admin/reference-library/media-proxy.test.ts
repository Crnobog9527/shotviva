import { NextRequest, NextResponse } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { user, fetchObject, sign, lookup } = vi.hoisted(() => ({ user: vi.fn(), fetchObject: vi.fn(), sign: vi.fn(), lookup: vi.fn() }))
vi.mock('@/core/auth/proxy-gates', () => ({ currentProxyUser: user }))
vi.mock('@/core/auth/supabase-admin', () => ({ createAdminSupabase: () => ({
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: lookup }) }) }),
}) }))
vi.mock('@/core/storage/r2-store', () => ({ r2Store: () => ({ presignGet: sign }) }))
const { referenceMedia } = await import('./media-proxy')

const id = '05a81252-9de0-4a58-94ff-b14b044a6bb8'
const url = `https://example.test/admin-media/references/${id}`
const request = (session = true) => new NextRequest(url, { headers: session ? { cookie: 'sb-test-auth-token=private' } : {} })
const session = (role: string, verified = true) => ({ user: { role, verified }, response: () => NextResponse.next() })

describe('reference media gateway', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchObject)
    lookup.mockResolvedValue({ data: { id } })
  })
  afterEach(() => { vi.unstubAllGlobals(); vi.resetAllMocks() })

  it('denies forwarded preview URLs even with a valid ordinary-user session', async () => {
    user.mockResolvedValue(session('user'))
    expect((await referenceMedia(request())).status).toBe(404)
    user.mockResolvedValue(session('admin', false))
    expect((await referenceMedia(request())).status).toBe(404)
    expect((await referenceMedia(request(false))).status).toBe(404)
    expect(lookup).not.toHaveBeenCalled()
    expect(sign).not.toHaveBeenCalled()
    expect(fetchObject).not.toHaveBeenCalled()
  })

  it('streams only the registered object, with no redirect, credentials or upstream URL exposed', async () => {
    user.mockResolvedValue(session('admin'))
    sign.mockResolvedValue('https://private.invalid/signed')
    fetchObject.mockResolvedValue(new Response('image', { headers: { 'X-Secret': 'upstream' } }))
    const res = await referenceMedia(request())
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('image')
    expect(res.headers.get('location')).toBeNull()
    expect(res.headers.get('x-secret')).toBeNull()
    expect(res.headers.get('cache-control')).toBe('private, no-store')
    expect(fetchObject.mock.calls[0][1].headers).toBeUndefined()
    expect(sign).toHaveBeenCalledWith(`references/${id}.webp`, { expiresInSeconds: 60 })
    lookup.mockResolvedValue({ data: null })
    expect((await referenceMedia(request())).status).toBe(404)
    expect(sign).toHaveBeenCalledTimes(1)
  })
})
