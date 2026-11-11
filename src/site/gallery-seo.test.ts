import { describe, expect, it, vi } from 'vitest'

import { pageSitemapUrls, robotsRules, zhSitemapUrls } from '@/core/seo'

import { site } from './site.config'

vi.mock('@/core/seo/indexing-now', () => ({ indexingOpenNow: () => true }))

// 创作库规格 §4 (T108): the sitemap never has a work page, and robots.txt never blocks /g/ or /tag/.
describe('gallery and search', () => {
  it('keeps /g/ out of every sitemap and out of robots.txt', () => {
    const urls = [...pageSitemapUrls(site), ...zhSitemapUrls(site)]
    expect(urls.some((url) => url.includes('/g/'))).toBe(false)
    const rules = JSON.stringify(robotsRules(site))
    expect(rules).not.toMatch(/\/g\/|\/tag\//)
  })
})
