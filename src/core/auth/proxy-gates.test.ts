import { NextRequest, NextResponse } from 'next/server'
import { describe, expect, it } from 'vitest'

import { decide, gateFor, lowercasePath, notFoundResponse, proxyGate } from './proxy-gates'

const user = (role: 'user' | 'admin', emailVerified = true) => ({ id: 'u', email: null, role, emailVerified, banned: false, locale: null })

describe('gateFor', () => {
  it.each([
    ['/admin', 'admin'],
    ['/admin/templates', 'admin'],
    ['/administrator', null],
    ['/account', 'signed_in'],
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

  it('404s the /zh address of an English-only page, admin included', async () => {
    for (const path of ['/zh/terms', '/zh/ai-restaurant-menu', '/zh/admin', '/zh/generate']) {
      expect((await gate(path)).status, path).toBe(404)
    }
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
