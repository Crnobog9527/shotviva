import { describe, expect, it, vi } from 'vitest'

import { pageMetadata, pageSitemapUrls, zhSitemapUrls } from '@/core/seo'
import { shippedTemplates } from '@/core/wishlist/public-wall-shape'

import { PAGE_LASTMOD } from './content/page-dates'
import { templateRequestsPageIn } from './content'
import { isTemplateRequestsUrl, withWishlistPages } from './content/template-requests-gate'
import { site } from './site.config'

// The open site (SITE_INDEXING=on in production).
vi.mock('@/core/seo/indexing-now', () => ({ indexingOpenNow: () => true }))

const en = templateRequestsPageIn('en')
const zh = templateRequestsPageIn('zh')
const EN_URL = 'https://shotviva.com/template-requests'
const ZH_URL = 'https://shotviva.com/zh/template-requests'

// Owner 2026-11-25 SEO plan for the wishlist's public page.
describe('/template-requests metadata', () => {
  it('uses the approved titles, description and H1s', () => {
    expect(en.title).toBe('Request a Custom AI Photo Template | Shotviva')
    expect(en.description).toBe("Can't find a template for your photo? Tell us what you have and the result you want. Vote on others' requests: we build the most-wanted ones and add them to Shotviva.")
    expect(en.h1).toBe("Can't find the right template? Request a custom AI photo template")
    expect(zh.title).toBe('找不到合适的模板？提交需求，大家投票，我们来做 | Shotviva')
    expect(zh.h1).toBe('找不到合适的 AI 修图模板？告诉我们你要什么')
    // 「许愿墙」 is a section name only, never in the title or H1; "wishlist" is never in the URL.
    expect(`${zh.title}${zh.h1}`).not.toContain('许愿墙')
    expect(en.path).not.toContain('wishlist')
  })

  it('is index,follow with a self canonical in each language, paired by hreflang', () => {
    const languages = { en: EN_URL, 'zh-Hans': ZH_URL, 'x-default': EN_URL }
    const enMeta = pageMetadata(site, en, 'en')
    const zhMeta = pageMetadata(site, zh, 'zh')
    expect(enMeta.robots).toEqual({ index: true, follow: true })
    expect(zhMeta.robots).toEqual({ index: true, follow: true })
    expect(enMeta.alternates?.canonical).toBe(EN_URL)
    expect(zhMeta.alternates?.canonical).toBe(ZH_URL)
    expect(enMeta.alternates?.languages).toEqual(languages)
    expect(zhMeta.alternates?.languages).toEqual(languages)
    expect(enMeta.title).toEqual({ absolute: en.title })
  })

  it('keeps prices, credit numbers and model names off the page', () => {
    for (const text of [JSON.stringify(en), JSON.stringify(zh)]) {
      expect(text).not.toMatch(/\$\d|\d+\s*credits?\b|积分\s*\d|\d+\s*积分|gpt|seedream|openrouter|影棚级/i)
    }
  })

  it('writes British English and spaces Chinese from Latin letters and digits', () => {
    expect(JSON.stringify(en)).not.toMatch(/\b(color|gray|favorite|center)\b/i)
    expect(JSON.stringify(zh)).not.toMatch(/[一-鿿][A-Za-z0-9]|[A-Za-z0-9][一-鿿]/)
  })
})

describe('/template-requests in the sitemaps', () => {
  it('is listed with a lastmod in both languages while the wishlist is open', () => {
    expect(withWishlistPages(pageSitemapUrls(site), true)).toContain(EN_URL)
    expect(withWishlistPages(zhSitemapUrls(site), true)).toContain(ZH_URL)
    expect(PAGE_LASTMOD['/template-requests']).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(PAGE_LASTMOD['/zh/template-requests']).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('drops only this page while the wishlist is off', () => {
    const urls = [...pageSitemapUrls(site), ...zhSitemapUrls(site)]
    const closed = withWishlistPages(urls, false)
    expect(closed).not.toContain(EN_URL)
    expect(closed).not.toContain(ZH_URL)
    expect(closed).toHaveLength(urls.length - 2)
  })

  it('matches the page by its path alone, whatever the query', () => {
    expect(isTemplateRequestsUrl(`${EN_URL}?sort=new&page=2`)).toBe(true)
    expect(isTemplateRequestsUrl('https://shotviva.com/template-requests/abc')).toBe(false)
    expect(isTemplateRequestsUrl('https://shotviva.com/pricing')).toBe(false)
  })
})

describe('no real request on the public page (Owner 2026-11-25)', () => {
  it('shows the eight fictional example wishes, said to be examples', () => {
    for (const text of [en, zh]) {
      expect(text.examples.wall.examples).toHaveLength(8)
      expect(text.examples.wall.note).toMatch(/illustrative|示意/)
    }
    expect(en.examples.intro).toMatch(/examples/)
    expect(zh.examples.intro).toMatch(/示例/)
  })

  it('lists a shipped template by name only, once, in the page language, and drops a hidden one', () => {
    const rows = [{ template_id: 't1' }, { template_id: 't-hidden' }, { template_id: 't1' }, { template_id: null }]
    const visible = [{ id: 't1', name: 'Noodle bowl', translations: { zh: { name: '汤面' } } }]
    expect(shippedTemplates(rows, visible, 'zh')).toEqual([{ id: 't1', name: '汤面' }])
    expect(shippedTemplates(rows, [{ ...visible[0], translations: null }], 'zh')).toEqual([{ id: 't1', name: 'Noodle bowl' }])
    expect(shippedTemplates([], visible, 'en')).toEqual([])
  })
})
