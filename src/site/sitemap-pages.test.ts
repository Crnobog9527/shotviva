import { describe, expect, it, vi } from 'vitest'

import { pageSitemapUrls, zhSitemapUrls } from '@/core/seo'

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
      'https://shotviva.com/pricing',
      'https://shotviva.com/terms',
      'https://shotviva.com/privacy',
      'https://shotviva.com/refund-policy',
      'https://shotviva.com/acceptable-use',
    ])
  })

  it('lists the three indexable Chinese pages', () => {
    expect(zhSitemapUrls(site)).toEqual([
      'https://shotviva.com/zh',
      'https://shotviva.com/zh/image-to-image-generator',
      'https://shotviva.com/zh/pricing',
    ])
  })
})
