import { describe, expect, it } from 'vitest'

import { localeRedirect, type LocaleRedirectInput } from './locale-redirect'

const TWINS = ['/', '/pricing', '/generate', '/generate/[templateId]', '/login']
const go = (input: Partial<LocaleRedirectInput>) =>
  localeRedirect({ method: 'GET', pathname: '/', search: '', chosen: null, ...input }, TWINS)

describe('redirect to the chosen language (ARCHITECTURE §17)', () => {
  it('sends a zh choice from an English page to its /zh twin, query kept', () => {
    expect(go({ pathname: '/', chosen: 'zh' })).toBe('/zh')
    expect(go({ pathname: '/pricing', search: '?ref=x', chosen: 'zh' })).toBe('/zh/pricing?ref=x')
    expect(go({ pathname: '/generate/pure-white', chosen: 'zh' })).toBe('/zh/generate/pure-white')
    expect(go({ pathname: '/login', search: '?next=%2Fphotos', chosen: 'zh' })).toBe('/zh/login?next=%2Fphotos')
  })

  it('sends an en choice from a /zh page back to English', () => {
    expect(go({ pathname: '/zh', chosen: 'en' })).toBe('/')
    expect(go({ pathname: '/zh/pricing', search: '?a=1', chosen: 'en' })).toBe('/pricing?a=1')
  })

  it('never redirects without a choice: crawlers and first visits get the page they asked for', () => {
    expect(go({ pathname: '/pricing' })).toBeNull()
    expect(go({ pathname: '/zh/pricing' })).toBeNull()
  })

  it('never redirects a page without a twin (legal pages, admin)', () => {
    expect(go({ pathname: '/terms', chosen: 'zh' })).toBeNull()
    expect(go({ pathname: '/admin', chosen: 'zh' })).toBeNull()
  })

  it('cannot loop: the target is already in the chosen language', () => {
    for (const [pathname, chosen] of [['/pricing', 'zh'], ['/zh/pricing', 'en']] as const) {
      const target = go({ pathname, chosen })
      expect(target).not.toBeNull()
      expect(go({ pathname: target ?? '', chosen })).toBeNull()
    }
    expect(go({ pathname: '/zh/pricing', chosen: 'zh' })).toBeNull()
    expect(go({ pathname: '/pricing', chosen: 'en' })).toBeNull()
  })

  it('leaves POSTs alone (server actions post to the page address)', () => {
    expect(go({ method: 'POST', pathname: '/pricing', chosen: 'zh' })).toBeNull()
    expect(go({ method: 'HEAD', pathname: '/pricing', chosen: 'zh' })).toBe('/zh/pricing')
  })
})
