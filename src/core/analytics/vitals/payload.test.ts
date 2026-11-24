import { describe, expect, it } from 'vitest'

import { vitalsPayload, type PageFacts } from './payload'
import { vitalsRouteRoot } from './route-root'

describe('vitalsRouteRoot', () => {
  it('keeps only the allowlisted first segment and the locale', () => {
    expect(vitalsRouteRoot('/generate')).toEqual({ route: 'generate', locale: 'en' })
    expect(vitalsRouteRoot('/zh/photos')).toEqual({ route: 'photos', locale: 'zh' })
    expect(vitalsRouteRoot('/zh/posters/new')).toEqual({ route: 'posters', locale: 'zh' })
    expect(vitalsRouteRoot('/account/billing')).toEqual({ route: 'account', locale: 'en' })
    expect(vitalsRouteRoot('/wishlist')).toEqual({ route: 'wishlist', locale: 'en' })
  })

  it('drops ids, tokens, queries and hashes', () => {
    const leaks = ['/photos/9b2c6f1e-4d1a-4c8e-9a51-7a7f0c1b2d3e?share=SECRET#t=tok', '/zh/account?token=abc', '/generate?template=x&email=a@b.c']
    for (const path of leaks) {
      const root = vitalsRouteRoot(path)
      expect(root).not.toBeNull()
      expect(JSON.stringify(root)).not.toMatch(/9b2c|SECRET|tok|abc|template|email|\?|#|\//)
    }
  })

  it('refuses every page outside the app roots', () => {
    for (const path of ['/', '/zh', '/admin', '/admin/users', '/checkout', '/join/abc', '/connect/graylum', '/pricing', '/zh/generatex', '/generate-x', '/zh/zh/generate', '/en/generate', '']) {
      expect(vitalsRouteRoot(path)).toBeNull()
    }
  })
})

const page: PageFacts = { href: 'https://shotviva.com/zh/photos/abc123?x=1', standalone: true, sw: true, shell: false, net: '4g' }
const lcp = { name: 'LCP', value: 1234.56, rating: 'needs-improvement', navigationType: 'navigate', id: 'v5-1' }

describe('vitalsPayload', () => {
  it('builds the fixed fields only, rounded', () => {
    expect(vitalsPayload(lcp, page)).toEqual({
      metric: 'LCP',
      value: 1235,
      rating: 'needs-improvement',
      route: 'photos',
      locale: 'zh',
      nav: 'navigate',
      standalone: true,
      sw: true,
      shell: false,
      net: '4g',
    })
    expect(vitalsPayload({ name: 'CLS', value: 0.123456, rating: 'poor' }, { ...page, net: undefined })).toMatchObject({ value: 0.1235, nav: 'navigate', net: null })
  })

  it('files a metric under the page it was measured on, not the current one', () => {
    expect(vitalsPayload({ ...lcp, navigationURL: 'https://shotviva.com/pricing' }, page)).toBeNull()
    expect(vitalsPayload({ ...lcp, navigationURL: 'https://shotviva.com/account?k=v' }, page)).toMatchObject({ route: 'account', locale: 'en' })
  })

  it('maps navigation types onto the kept five and drops soft navigations', () => {
    expect(vitalsPayload({ ...lcp, navigationType: 'back-forward-cache' }, page)?.nav).toBe('back-forward')
    expect(vitalsPayload({ ...lcp, navigationType: 'back_forward' }, page)?.nav).toBe('back-forward')
    expect(vitalsPayload({ ...lcp, navigationType: 'restore' }, page)?.nav).toBe('restore')
    expect(vitalsPayload({ ...lcp, navigationType: 'soft-navigation' }, page)).toBeNull()
  })

  it('rejects unknown metrics, ratings and non-finite values', () => {
    expect(vitalsPayload({ ...lcp, name: 'FID' }, page)).toBeNull()
    expect(vitalsPayload({ ...lcp, rating: 'ok' }, page)).toBeNull()
    expect(vitalsPayload({ ...lcp, value: Number.NaN }, page)).toBeNull()
    expect(vitalsPayload({ ...lcp, value: -1 }, page)).toBeNull()
    expect(vitalsPayload({ ...lcp, value: '12' }, page)).toBeNull()
    expect(vitalsPayload({ ...lcp, navigationURL: 'https://shotviva.com/admin' }, page)).toBeNull()
  })

  it('ignores an unknown connection type', () => {
    expect(vitalsPayload(lcp, { ...page, net: '5g' })?.net).toBeNull()
  })
})
