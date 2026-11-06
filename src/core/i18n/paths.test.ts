import { describe, expect, it } from 'vitest'

import { localeOfPath, localeOfReferer, localizePath, matchesPaths, splitLocale } from './paths'
import { hrefIn, otherLocale, switchHref } from './switch-target'

const zhPaths = ['/', '/pricing', '/generate', '/generate/[templateId]', '/reset/update']

describe('splitLocale / localizePath (ARCHITECTURE §17)', () => {
  it.each([
    ['/zh', 'zh', '/'],
    ['/zh/pricing', 'zh', '/pricing'],
    ['/zh/generate/pure-white', 'zh', '/generate/pure-white'],
    ['/pricing', 'en', '/pricing'],
    ['/', 'en', '/'],
    ['/zhuhai', 'en', '/zhuhai'],
  ])('%s → %s %s', (pathname, locale, path) => {
    expect(splitLocale(pathname)).toEqual({ locale, path })
    expect(localeOfPath(pathname)).toBe(locale)
  })

  it('prefixes only Chinese, never with a trailing slash, keeping the query', () => {
    expect(localizePath('/', 'zh')).toBe('/zh')
    expect(localizePath('/pricing', 'zh')).toBe('/zh/pricing')
    expect(localizePath('/login?next=%2Fzh%2Faccount', 'zh')).toBe('/zh/login?next=%2Fzh%2Faccount')
    expect(localizePath('/?checkout=1', 'zh')).toBe('/zh?checkout=1')
    expect(localizePath('/pricing', 'en')).toBe('/pricing')
  })

  it('reads the language of the page a request came from', () => {
    expect(localeOfReferer('https://shotviva.com/zh/generate/pure-white')).toBe('zh')
    expect(localeOfReferer('https://shotviva.com/generate')).toBe('en')
    expect(localeOfReferer(null)).toBeNull()
    expect(localeOfReferer('not a url')).toBeNull()
  })
})

describe('matchesPaths', () => {
  it('matches exact paths and one-segment parameters only', () => {
    expect(matchesPaths('/', zhPaths)).toBe(true)
    expect(matchesPaths('/generate/pure-white', zhPaths)).toBe(true)
    expect(matchesPaths('/generate/pure-white/extra', zhPaths)).toBe(false)
    expect(matchesPaths('/pricing?checkout=cancelled', zhPaths)).toBe(true)
    expect(matchesPaths('/reset', zhPaths)).toBe(false)
    expect(matchesPaths('/terms', zhPaths)).toBe(false)
    expect(matchesPaths('/pricingx', zhPaths)).toBe(false)
  })
})

describe('switchHref (LAUNCH §7.6)', () => {
  it('stays on the same page when it has a translation', () => {
    expect(switchHref('/pricing', 'en', zhPaths)).toBe('/zh/pricing')
    expect(switchHref('/generate/pure-white', 'en', zhPaths)).toBe('/zh/generate/pure-white')
    expect(switchHref('/pricing', 'zh', zhPaths)).toBe('/pricing')
    expect(switchHref('/', 'zh', zhPaths)).toBe('/')
  })

  it('goes to the Chinese home from an English-only page', () => {
    expect(switchHref('/terms', 'en', zhPaths)).toBe('/zh')
    expect(switchHref('/ai-restaurant-menu', 'en', zhPaths)).toBe('/zh')
  })

  it('has exactly two languages', () => {
    expect(otherLocale('en')).toBe('zh')
    expect(otherLocale('zh')).toBe('en')
  })
})

describe('globe menu targets (DESIGN §6.9 item 4)', () => {
  it('offers the same page in each language, the Chinese home for English-only pages', () => {
    expect(hrefIn('en', '/pricing', zhPaths)).toBe('/pricing')
    expect(hrefIn('zh', '/pricing', zhPaths)).toBe('/zh/pricing')
    expect(hrefIn('zh', '/generate/pure-white', zhPaths)).toBe('/zh/generate/pure-white')
    expect(hrefIn('zh', '/terms', zhPaths)).toBe('/zh')
    expect(hrefIn('en', '/terms', zhPaths)).toBe('/terms')
  })
})
