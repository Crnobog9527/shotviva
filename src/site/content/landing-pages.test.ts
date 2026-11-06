import { describe, expect, it } from 'vitest'

import type { ContentPage } from '@/core/content'

import { site } from '../site.config'
import { contentPagesIn } from './localized'
import { menuCostUsd, photosLeftAfterMenu } from './offer'
import { aiRestaurantMenu } from './pages/ai-restaurant-menu'
import { commercialPhotography } from './pages/commercial-photography'
import { PLATFORM_SPECS } from './platform-specs'
import { zhAiRestaurantMenu } from './zh/pages/ai-restaurant-menu'

// The three SEO landing pages (T44, design/comps-v3-b/landing.html, ARCHITECTURE §12, §17).
describe('landing pages', () => {
  it('exist in both languages with the same slugs; only /zh/image-to-image-generator is indexable in Chinese', () => {
    const slugs = (locale: 'en' | 'zh') => contentPagesIn(locale).map((page) => page.slug)
    expect(slugs('en')).toEqual(['image-to-image-generator', 'commercial-photography', 'ai-restaurant-menu'])
    expect(slugs('zh')).toEqual(slugs('en'))
    for (const slug of slugs('en')) {
      expect(site.indexing.indexablePaths).toContain(`/${slug}`)
      expect(site.locales.zhPaths).toContain(`/${slug}`)
    }
    expect(site.indexing.zhIndexablePaths).not.toContain('/commercial-photography')
    expect(site.indexing.zhIndexablePaths).not.toContain('/ai-restaurant-menu')
  })

  it('links back home with the R8 anchor and keeps 2–3 related pages', () => {
    for (const page of [...contentPagesIn('en'), ...contentPagesIn('zh')]) {
      expect(page.related.length).toBeGreaterThanOrEqual(2)
      expect(page.related.length).toBeLessThanOrEqual(3)
      expect(page.related.some((link) => link.href === '/')).toBe(true)
    }
  })

  it('quotes the platforms\' published figures from platform-specs.ts, with a source note', () => {
    const facts = (page: ContentPage) => page.facts.map((fact) => `${fact.label} ${fact.value}`).join(' ')
    expect(facts(commercialPhotography)).toContain(`${PLATFORM_SPECS.amazon.zoomPx.toLocaleString('en-US')} px`)
    expect(facts(commercialPhotography)).toContain('2,000 px')
    expect(facts(commercialPhotography)).toContain('2,048 × 2,048 px')
    expect(facts(aiRestaurantMenu)).toContain('1,400 × 800 px')
    expect(facts(aiRestaurantMenu)).toContain('550 × 440 px')
    expect(facts(zhAiRestaurantMenu)).toContain('1,400 × 800 px')
    for (const page of [commercialPhotography, aiRestaurantMenu]) expect(page.landing.factsNote).toMatch(/November 2026/)
  })

  it('bills the menu from config: a half day $400–$2,500 against 10 dishes at Standard', () => {
    const { photographer, site: us } = aiRestaurantMenu.costBills
    expect(photographer.total.amount).toBe('$400–$2,500')
    expect(photographer.lines.map((line) => line.label).join(' ')).not.toMatch(/retouch/i)
    expect(menuCostUsd).toBe('$8')
    expect(photosLeftAfterMenu).toBe(15)
    expect(us.lines.map((line) => line.value)).toEqual(['$19.90', '20 credits ≈ $8', '15 more photos'])
    expect(us.total.when).toBe(`about ${site.marketing.photoSecondsApprox} seconds a photo`)
  })

  it('never claims a marketplace or delivery app allows AI photos', () => {
    for (const page of [commercialPhotography, aiRestaurantMenu]) {
      // The questions are the user's own words; the claims are in the answers and the facts.
      const text = [...page.faq.map((item) => item.answer), ...page.facts.map((fact) => fact.value)].join(' ')
      expect(text).not.toMatch(/(allowed|approved|accepted) (on|by) (Amazon|Etsy|DoorDash|Uber Eats|Grubhub)/i)
      expect(text).toMatch(/check/i)
    }
  })
})
