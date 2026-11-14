import { NextRequest, NextResponse } from 'next/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('../auth/supabase-admin', () => ({ createAdminSupabase: () => ({}) }))

import { isBotRequest, toOptionPage } from './server'

const request = (path: string, ua = 'Mozilla/5.0 (Macintosh) Chrome/131.0 Safari/537.36') =>
  new NextRequest(new URL(path, 'https://shotviva.com'), { headers: { 'user-agent': ua } })

describe('toOptionPage', () => {
  it('adds the rewrite when the locale router just lets a /zh address through', () => {
    const response = toOptionPage(() => NextResponse.next(), request('/zh?a=1'), '/zh/x/hero/art-style')
    expect(response.headers.get('x-middleware-rewrite')).toBe('https://shotviva.com/zh/x/hero/art-style?a=1')
    expect(response.headers.get('x-middleware-next')).toBeNull()
  })

  it('keeps the locale router’s own rewrite and hands it the option page', () => {
    const router = vi.fn((req: NextRequest) => NextResponse.rewrite(new URL(`/en${req.nextUrl.pathname}`, req.url)))
    const response = toOptionPage(router, request('/'), '/x/hero/art-style')
    expect(router.mock.calls[0]?.[0].nextUrl.pathname).toBe('/x/hero/art-style')
    expect(response.headers.get('x-middleware-rewrite')).toBe('https://shotviva.com/en/x/hero/art-style')
  })
})

describe('isBotRequest', () => {
  it('treats crawlers, headless browsers and a missing user agent as bots', () => {
    expect(isBotRequest(request('/', 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'))).toBe(true)
    expect(isBotRequest(request('/', 'Mozilla/5.0 HeadlessChrome/131.0'))).toBe(true)
    expect(isBotRequest(request('/', ''))).toBe(true)
    expect(isBotRequest(request('/'))).toBe(false)
  })
})
