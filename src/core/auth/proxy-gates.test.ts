import { NextRequest, NextResponse } from 'next/server'
import { describe, expect, it } from 'vitest'

import { decide, gateFor, lowercasePath, notFoundResponse, proxyGate, toAccountLocale } from './proxy-gates'

const user = (role: 'user' | 'admin', emailVerified = true) => ({ id: 'u', email: null, role, emailVerified, banned: false, locale: null })

describe('gateFor', () => {
  it.each([
    ['/admin', 'admin'],
    ['/admin/templates', 'admin'],
    ['/administrator', null],
    ['/account', 'signed_in'],
    ['/checkout', 'signed_in'],
    ['/reset/update', 'signed_in'],
    ['/reset', null],
    ['/generate', 'signed_in'],
    ['/generate/pure-white', 'signed_in'],
    ['/photos', 'signed_in'],
    ['/photos/9b1c', 'signed_in'],
    ['/wishlist', 'signed_in'],
    ['/generated', null],
    ['/connect/graylum', 'signed_in'],
    ['/connect/graylum/', 'signed_in'],
    ['/connect/graylum/authorize', null],
    ['/', null],
  ])('%s -> %s', (path, gate) => {
    expect(gateFor(path)).toBe(gate)
  })
})

describe('decide', () => {
  it('lets only verified admins through /admin', () => {
    expect(decide('admin', user('admin'), '/admin', '')).toBe('pass')
    expect(decide('admin', user('user'), '/admin', '')).toBe('not_found')
    expect(decide('admin', user('admin', false), '/admin', '')).toBe('not_found')
    expect(decide('admin', null, '/admin', '')).toBe('not_found')
  })

  it('sends visitors to login with the page as next, and unverified users to the notice', () => {
    expect(decide('signed_in', null, '/account', '?x=1')).toEqual({ redirect: '/login?next=%2Faccount%3Fx%3D1' })
    expect(decide('signed_in', user('user', false), '/account', '')).toEqual({ redirect: '/login?error=unverified' })
    expect(decide('signed_in', user('user'), '/account', '')).toBe('pass')
  })

  it('keeps a Chinese visitor on the Chinese login page', () => {
    expect(decide('signed_in', null, '/zh/photos', '', 'zh')).toEqual({ redirect: '/zh/login?next=%2Fzh%2Fphotos' })
    expect(decide('signed_in', user('user', false), '/zh/photos', '', 'zh')).toEqual({ redirect: '/zh/login?error=unverified' })
  })
})

const zhPaths = ['/', '/pricing', '/account', '/generate/[templateId]']
// Stands in for the locale router: marks the response so a test can see it was forwarded.
const forward = (request: NextRequest) => {
  const response = NextResponse.next({ request })
  response.headers.set('x-forwarded-to', 'locale-router')
  return response
}
// Stands in for the static 404 pages (app/[locale]/(marketing)/page-not-found).
async function notFoundGate(url: string) {
  const fetched: { url: string; marked: string | null }[] = []
  const fetchPage = async (target: URL, init: RequestInit) => {
    fetched.push({ url: target.toString(), marked: new Headers(init.headers).get('x-shotviva-render-404') })
    const zh = target.pathname.startsWith('/zh')
    return new Response(zh ? '<html lang="zh-Hans"><h1>页面不存在</h1></html>' : '<html lang="en"><h1>Not here</h1></html>')
  }
  const response = await proxyGate(new NextRequest(`http://localhost:3000${url}`), { translatedPaths: zhPaths, forward, fetchPage })
  return { response, fetched }
}
const gate = (url: string) => proxyGate(new NextRequest(`http://localhost:3000${url}`), { translatedPaths: zhPaths, forward })

describe('proxyGate without a session cookie', () => {
  it('404s /admin with noindex before rendering', async () => {
    const response = await gate('/admin/templates')
    expect(response.status).toBe(404)
    expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow')
  })

  it('307s /account to login', async () => {
    const response = await gate('/account')
    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe('http://localhost:3000/login?next=%2Faccount')
  })

  it('passes marketing pages to the locale router', async () => {
    const response = await gate('/pricing')
    expect(response.status).toBe(200)
    expect(response.headers.get('x-forwarded-to')).toBe('locale-router')
    expect(notFoundResponse().status).toBe(404)
  })

  it('keeps route handlers and sitemaps out of the locale router', async () => {
    for (const path of ['/api/generate', '/auth/callback', '/sitemap-zh.xml', '/robots.txt']) {
      expect((await gate(path)).headers.get('x-forwarded-to')).toBeNull()
    }
  })
})

describe('proxyGate on /zh (ARCHITECTURE §17)', () => {
  it('routes the Chinese version of a translated page', async () => {
    for (const path of ['/zh', '/zh/pricing']) {
      const response = await gate(path)
      expect(response.status, path).toBe(200)
      expect(response.headers.get('x-forwarded-to')).toBe('locale-router')
    }
    // A translated signed-in page still goes through its gate first.
    expect((await gate('/zh/generate/pure-white')).headers.get('location')).toContain('/zh/login?next=')
  })

  it('answers a /zh address of an English-only page with the Chinese 404 page, status 404', async () => {
    for (const path of ['/zh/terms', '/zh/ai-restaurant-menu', '/zh/admin', '/zh/generate', '/zh/nope']) {
      const { response, fetched } = await notFoundGate(path)
      expect(response.status, path).toBe(404)
      expect(response.headers.get('content-type')).toContain('text/html')
      const html = await response.text()
      expect(html, path).toContain('<html lang="zh-Hans">')
      expect(html, path).toContain('页面不存在')
      expect(fetched).toEqual([{ url: 'http://localhost:3000/zh/page-not-found', marked: '1' }])
    }
  })

  it('serves the 404 pages themselves only to the proxy, a 404 to everyone else', async () => {
    expect((await notFoundGate('/page-not-found')).response.status).toBe(404)
    expect((await notFoundGate('/zh/page-not-found')).response.status).toBe(404)
    const marked = (url: string) =>
      proxyGate(new NextRequest(`http://localhost:3000${url}`, { headers: { 'x-shotviva-render-404': '1' } }), {
        translatedPaths: zhPaths,
        forward,
      })
    expect((await marked('/zh/page-not-found')).headers.get('x-forwarded-to')).toBe('locale-router')
  })

  it('falls back to a plain 404 when the page cannot be fetched', async () => {
    const response = await proxyGate(new NextRequest('http://localhost:3000/zh/terms'), {
      translatedPaths: zhPaths,
      forward,
      fetchPage: () => Promise.reject(new Error('offline')),
    })
    expect(response.status).toBe(404)
    expect(await response.text()).toBe('Not Found')
  })

  it('sends a signed-out visitor to the Chinese login page, back to the Chinese page', async () => {
    const response = await gate('/zh/account?tab=1')
    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe('http://localhost:3000/zh/login?next=%2Fzh%2Faccount%3Ftab%3D1')
  })
})

describe('proxyGate on mixed-case addresses', () => {
  it('sends every non-lowercase page address to its lowercase form before any gate', async () => {
    for (const [path, target] of [
      ['/ACCOUNT', '/account'],
      ['/Zh/account', '/zh/account'],
      ['/Admin', '/admin'],
      ['/Admin/users?q=X', '/admin/users?q=X'],
      ['/Pricing', '/pricing'],
    ]) {
      const response = await gate(path)
      expect(response.status, path).toBe(308)
      expect(response.headers.get('location')).toBe(`http://localhost:3000${target}`)
    }
  })

  it('keeps percent-escapes and leaves lowercase addresses alone', () => {
    expect(lowercasePath('/generate/A%2Fb')).toBe('/generate/a%2Fb')
    expect(lowercasePath('/zh/pricing')).toBeNull()
  })
})

describe('development-only pages', () => {
  it('404s the upload test outside development, and always under /zh', async () => {
    expect((await gate('/generate/upload-test')).status).toBe(404)
    expect((await gate('/zh/generate/upload-test')).status).toBe(404)
    const dev = (url: string) =>
      proxyGate(new NextRequest(`http://localhost:3000${url}`), { translatedPaths: zhPaths, forward, devPages: true })
    expect((await dev('/generate/upload-test')).status).toBe(307)
    expect((await dev('/zh/generate/upload-test')).status).toBe(404)
  })
})

// ARCHITECTURE §17 「怎么选语言」: the stored choice (NEXT_LOCALE) moves a visit to its twin.
describe('the chosen language', () => {
  const visit = (url: string, cookie: string, method = 'GET') =>
    proxyGate(new NextRequest(`http://localhost:3000${url}`, { method, headers: { cookie } }), { translatedPaths: zhPaths, forward })

  it('307s a zh choice from an English page to its /zh twin, query kept', async () => {
    const response = await visit('/pricing?ref=nav', 'NEXT_LOCALE=zh')
    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe('http://localhost:3000/zh/pricing?ref=nav')
    expect((await visit('/', 'NEXT_LOCALE=zh')).headers.get('location')).toBe('http://localhost:3000/zh')
  })

  it('307s an en choice from a /zh page back to English, before the sign-in gate', async () => {
    expect((await visit('/zh/pricing', 'NEXT_LOCALE=en')).headers.get('location')).toBe('http://localhost:3000/pricing')
    expect((await visit('/zh/account', 'NEXT_LOCALE=en')).headers.get('location')).toBe('http://localhost:3000/account')
  })

  it('serves the page when it is already in the chosen language: no loop', async () => {
    expect((await visit('/zh/pricing', 'NEXT_LOCALE=zh')).headers.get('x-forwarded-to')).toBe('locale-router')
    expect((await visit('/pricing', 'NEXT_LOCALE=en')).headers.get('x-forwarded-to')).toBe('locale-router')
  })

  it('leaves untwinned pages, POSTs and visitors without a choice alone', async () => {
    expect((await visit('/terms', 'NEXT_LOCALE=zh')).headers.get('x-forwarded-to')).toBe('locale-router')
    expect((await visit('/pricing', 'NEXT_LOCALE=zh', 'POST')).headers.get('x-forwarded-to')).toBe('locale-router')
    expect((await visit('/pricing', '')).headers.get('x-forwarded-to')).toBe('locale-router')
  })

  it('on app pages, an account language stands in for a missing cookie and is copied into it', () => {
    const signedIn = { ...user('user'), locale: 'zh' as const }
    const moved = toAccountLocale(new NextRequest('http://localhost:3000/photos?x=1'), signedIn, [...zhPaths, '/photos'])
    expect(moved?.status).toBe(307)
    expect(moved?.headers.get('location')).toBe('http://localhost:3000/zh/photos?x=1')
    expect(moved?.cookies.get('NEXT_LOCALE')?.value).toBe('zh')
    expect(toAccountLocale(new NextRequest('http://localhost:3000/zh/photos'), signedIn, [...zhPaths, '/photos'])).toBeNull()
    expect(toAccountLocale(new NextRequest('http://localhost:3000/photos'), user('user'), [...zhPaths, '/photos'])).toBeNull()
  })
})
