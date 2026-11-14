import { describe, expect, it, vi } from 'vitest'

import { localizePath } from '@/core/i18n'
import { organizationLd, pageMetadata, pageSitemapUrls, urlsetXml, zhSitemapUrls } from '@/core/seo'

import { PAGE_LASTMOD } from './content/page-dates'
import { site } from './site.config'

// The open site (SITE_INDEXING=on in production). Owner's SEO launch handbook, PATCH v3 G7:
// these pages and nothing else; never /refund, /gallery or pages that do not exist yet.
vi.mock('@/core/seo/indexing-now', () => ({ indexingOpenNow: () => true }))

describe('Shotviva sitemap once indexing opens', () => {
  it('lists the home, landing, pricing and legal pages', () => {
    expect(pageSitemapUrls(site)).toEqual([
      'https://shotviva.com/',
      'https://shotviva.com/image-to-image-generator',
      'https://shotviva.com/commercial-photography',
      'https://shotviva.com/ai-restaurant-menu',
      'https://shotviva.com/transparent-background',
      'https://shotviva.com/pricing',
      'https://shotviva.com/terms',
      'https://shotviva.com/privacy',
      'https://shotviva.com/refund-policy',
      'https://shotviva.com/acceptable-use',
    ])
  })

  // SEO patch v5 item 1 (Owner 2026-11-12): the two Chinese verticals joined the three T21 pages.
  it('lists the five indexable Chinese pages', () => {
    expect(zhSitemapUrls(site)).toEqual([
      'https://shotviva.com/zh',
      'https://shotviva.com/zh/image-to-image-generator',
      'https://shotviva.com/zh/commercial-photography',
      'https://shotviva.com/zh/ai-restaurant-menu',
      'https://shotviva.com/zh/pricing',
    ])
  })
})

// SEO patch v5: the sitemaps come from the same registry as each page's robots meta, canonical
// and hreflang, so the three can never disagree.
describe('sitemaps, robots meta, canonical and hreflang agree (SEO patch v5)', () => {
  const urls = [...pageSitemapUrls(site), ...zhSitemapUrls(site)]
  const logical = (pathname: string) => (pathname === '/zh' ? '/' : pathname.replace(/^\/zh(?=\/)/, ''))

  it('every listed address is index,follow with a self canonical', () => {
    for (const url of urls) {
      const { pathname } = new URL(url)
      const locale = pathname === '/zh' || pathname.startsWith('/zh/') ? 'zh' : 'en'
      const meta = pageMetadata(site, { path: logical(pathname), title: 't', description: 'd' }, locale)
      expect(meta.robots, url).toEqual({ index: true, follow: true })
      expect(meta.alternates?.canonical, url).toBe(url)
    }
  })

  it('pairs every English page that has an indexable /zh twin with it, both ways, x-default English', () => {
    for (const path of site.indexing.zhIndexablePaths) {
      const languages = pageMetadata(site, { path, title: 't', description: 'd' }).alternates?.languages
      const en = `https://shotviva.com${path === '/' ? '/' : path}`
      const zh = `https://shotviva.com${localizePath(path, 'zh')}`
      expect(languages, path).toEqual({ en, 'zh-Hans': zh, 'x-default': en })
      expect(pageMetadata(site, { path, title: 't', description: 'd' }, 'zh').alternates?.languages, path).toEqual(languages)
    }
    expect(pageMetadata(site, { path: '/terms', title: 't', description: 'd' }).alternates?.languages).toBeUndefined()
  })

  it('gives every listed address a real lastmod, none in the future', () => {
    const today = new Date().toISOString().slice(0, 10)
    for (const url of urls) {
      const date = PAGE_LASTMOD[new URL(url).pathname]
      expect(date, url).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(date! <= today, url).toBe(true)
    }
    const xml = urlsetXml(pageSitemapUrls(site), PAGE_LASTMOD)
    expect(xml.match(/<lastmod>/g)).toHaveLength(10)
    expect(xml).toContain('<url><loc>https://shotviva.com/</loc><lastmod>')
  })

  it('leaves sameAs out while no account is claimed, never an empty list or placeholder', () => {
    const org = organizationLd(site)
    if (site.brand.sameAs.length === 0) expect(org).not.toHaveProperty('sameAs')
    else expect((org.sameAs as string[]).every((url) => url.startsWith('https://'))).toBe(true)
  })
})

