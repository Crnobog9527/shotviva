import { NextRequest, NextResponse } from 'next/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { touchOf } from './first-touch'
import { withFirstTouch } from './proxy'
import { openTouch, sealTouch } from './seal'

const secret = 'test-secret'
const page = (path: string, headers: Record<string, string> = {}) =>
  new NextRequest(new URL(path, 'https://shotviva.com'), { headers: { accept: 'text/html,application/xhtml+xml', ...headers } })
const context = { secret, allowed: true, bot: false, ownHost: 'shotviva.com', now: 1_800_000_000_000 }
const set = (response: NextResponse) => response.cookies.get('sv_ft')

describe('withFirstTouch', () => {
  it('sets a sealed, httpOnly, 90-day cookie on the first public page', () => {
    const response = withFirstTouch(NextResponse.next(), page('/zh/t/ramen-studio?utm_source=test', { referer: 'https://news.ycombinator.com/' }), context)
    const cookie = set(response)
    expect(cookie).toMatchObject({ httpOnly: true, maxAge: 90 * 24 * 60 * 60, path: '/' })
    expect(openTouch(cookie?.value, secret)).toMatchObject({ p: '/zh/t/ramen-studio?utm_source=test', r: 'news.ycombinator.com', us: 'test' })
  })

  it('never replaces a valid one, but replaces one that is not ours', () => {
    const first = sealTouch(touchOf({ url: new URL('https://shotviva.com/pricing'), referrer: null, ownHost: 'shotviva.com', now: 1_700_000_000_000 }), secret)
    expect(set(withFirstTouch(NextResponse.next(), page('/', { cookie: `sv_ft=${first}` }), context))).toBeUndefined()
    expect(set(withFirstTouch(NextResponse.next(), page('/', { cookie: 'sv_ft=forged.value' }), context))?.value).toBeTruthy()
  })

  it('skips crawlers, prefetches, RSC requests, non-pages and signed-in pages', () => {
    expect(set(withFirstTouch(NextResponse.next(), page('/'), { ...context, bot: true }))).toBeUndefined()
    expect(set(withFirstTouch(NextResponse.next(), page('/', { rsc: '1' }), context))).toBeUndefined()
    expect(set(withFirstTouch(NextResponse.next(), page('/', { 'next-router-prefetch': '1' }), context))).toBeUndefined()
    expect(set(withFirstTouch(NextResponse.next(), page('/', { accept: 'application/json' }), context))).toBeUndefined()
    for (const path of ['/api/version', '/admin', '/zh/account', '/generate/x', '/x/hero/art-style']) {
      expect(set(withFirstTouch(NextResponse.next(), page(path), context))).toBeUndefined()
    }
  })

  it('without analytics consent sets nothing and removes an existing copy', () => {
    expect(set(withFirstTouch(NextResponse.next(), page('/'), { ...context, allowed: false }))).toBeUndefined()
    const removed = withFirstTouch(NextResponse.next(), page('/', { cookie: 'sv_ft=x.y' }), { ...context, allowed: false })
    expect(removed.headers.get('set-cookie')).toMatch(/sv_ft=;.*(Max-Age=0|Expires=Thu, 01 Jan 1970)/i)
  })
})
