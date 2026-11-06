import { describe, expect, it, vi } from 'vitest'

import { isIndexable } from './indexing'
import { pageSitemapUrls, sitemapIndexXml, urlsetXml } from './sitemap'
import { testSite, withImageOff } from './test-site'

// These cases describe the open site (SITE_INDEXING=on in production); the closed, pre-launch
// state is covered in prelaunch.test.ts.
vi.mock('./indexing-now', () => ({ indexingOpenNow: () => true }))

describe('sitemap', () => {
  it('lists only configured indexable paths, no trailing slash except root', () => {
    expect(pageSitemapUrls(testSite())).toEqual([
      'https://example.com/',
      'https://example.com/image-to-image-generator',
      'https://example.com/generate',
    ])
  })

  // AGENTS §7 item 5: a disabled module's routes are not in the sitemap.
  it('drops module routes when the module is off', () => {
    const urls = pageSitemapUrls(withImageOff(testSite()))
    expect(urls).not.toContain('https://example.com/generate')
    expect(urlsetXml(urls)).not.toContain('/generate')
  })

  it('renders an index pointing at the child sitemaps', () => {
    const xml = sitemapIndexXml(testSite())
    expect(xml).toContain('<sitemapindex')
    expect(xml).toContain('<loc>https://example.com/sitemap-pages.xml</loc>')
  })
})

describe('indexing switch', () => {
  it('indexes only listed paths whose module is on', () => {
    const site = testSite()
    expect(isIndexable(site, '/')).toBe(true)
    expect(isIndexable(site, '/pricing')).toBe(false)
    expect(isIndexable(site, '/account')).toBe(false)
    expect(isIndexable(withImageOff(site), '/generate')).toBe(false)
  })
})

// Pages that declare a module (e.g. a tool page) leave the sitemap with it.
describe('page gates', () => {
  const gates = [{ path: '/image-to-image-generator', module: 'image' as const }]

  it('keeps module pages while the module is on', () => {
    expect(pageSitemapUrls(testSite(), gates)).toContain(
      'https://example.com/image-to-image-generator',
    )
  })

  it('drops module pages and noindexes them when the module is off', () => {
    const off = withImageOff(testSite())
    expect(pageSitemapUrls(off, gates)).toEqual(['https://example.com/'])
    expect(isIndexable(off, '/image-to-image-generator', gates)).toBe(false)
  })
})
