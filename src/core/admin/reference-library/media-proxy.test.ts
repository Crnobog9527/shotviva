import { NextRequest, NextResponse } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { user, fetchObject, sign, lookup } = vi.hoisted(() => ({ user: vi.fn(), fetchObject: vi.fn(), sign: vi.fn(), lookup: vi.fn() }))
vi.mock('@/core/auth/proxy-gates', () => ({ currentProxyUser: user }))
vi.mock('@/core/auth/supabase-admin', () => ({ createAdminSupabase: () => ({
  from: () => ({ select: () => ({ eq() { return this }, maybeSingle: lookup }) }),
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

  it.each(['references', 'prompt-lab'])('denies banned administrators before reading or signing %s', async path => {
    user.mockResolvedValue({ ...session('admin'), user: { role: 'admin', verified: true, banned: true } })
    const req = new NextRequest(url.replace('/references/', '/' + path + '/'), { headers: { cookie: 'sb-test-auth-token=private' } })
    expect((await referenceMedia(req)).status).toBe(404)
    expect(lookup).not.toHaveBeenCalled()
    expect(sign).not.toHaveBeenCalled()
    expect(fetchObject).not.toHaveBeenCalled()
  })

  it('protects generated results and only signs the registered output after authorization', async () => {
    const output = new NextRequest(url.replace('/references/', '/prompt-lab/'), { headers: { cookie: 'sb-test-auth-token=private' } })
    user.mockResolvedValue(session('user'))
    expect((await referenceMedia(output)).status).toBe(404)
    expect(lookup).not.toHaveBeenCalled()
    user.mockResolvedValue(session('admin'))
    lookup.mockResolvedValueOnce({ data: null })
    expect((await referenceMedia(output)).status).toBe(404)
    expect(sign).not.toHaveBeenCalled()
    sign.mockResolvedValue('https://private.invalid/output')
    fetchObject.mockResolvedValue(new Response('image'))
    const res = await referenceMedia(output)
    expect(res.headers.get('content-type')).toBe('image/png')
    expect(res.headers.get('cache-control')).toBe('private, no-store')
    expect(sign).toHaveBeenCalledWith(`prompt-lab/outputs/${id}.png`, { expiresInSeconds: 60 })
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
