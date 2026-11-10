import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { validateContentPage } from '@/core/content'

import { FALLBACK_CREDITS, fillCredits } from '../credits'

import { zhHomePage } from './home'
import { zhAiRestaurantMenu } from './pages/ai-restaurant-menu'
import { zhCommercialPhotography } from './pages/commercial-photography'
import { zhImageToImageGenerator } from './pages/image-to-image-generator'
import { zhPricingPage } from './pricing'
import { privateDoc } from '../../../../tests/support/private-docs'

// The keyword map lives in the private docs repo (tests/support/private-docs.ts); skipped where absent.
const keywordMap = privateDoc('seo资料', 'Shotviva 页面与主词映射（中文口径）.csv')

// The Chinese keyword map (T22): URL → keyword, the source of every /zh Title and H1.
function zhKeywords(): Map<string, string> {
  const csv = readFileSync(keywordMap!, 'utf8')
  return new Map(
    csv
      .split(/\r?\n/)
      .slice(1)
      .map((line) => line.split(','))
      .filter(([, url]) => url?.startsWith('/zh'))
      .map(([, url, keyword]) => [url as string, keyword as string]),
  )
}

function strings(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) return value.flatMap(strings)
  // Addresses and ids are not copy: slugs, hrefs, module and template ids and the stored
  // category names (`key`, `categoryKeys`) stay English (建站规格 R4); `file` is the demo
  // photo's camera file name (IMG_2047.jpg), shown as is.
  if (value && typeof value === 'object') {
    return Object.entries(value)
      .filter(([key]) => !['slug', 'href', 'path', 'module', 'src', 'id', 'file', 'key', 'categoryKeys', 'keyword'].includes(key))
      .flatMap(([, inner]) => strings(inner))
  }
  return []
}

// Latin words allowed on a Chinese page (建站规格 §6.1 rule 3): the brand, AI, payment, phone,
// browser and file-format names, units, and API (the For business plate, T37). Image paths and alt text of the shared placeholders are skipped.
// Proper nouns the landing pages cite (T44): the platforms whose photo rules they quote and the
// price guides behind the bills. The business inquiry form's platform choices (T86).
const LATIN_OK = new Set(['Shotviva', 'Shopify', 'Amazon', 'Etsy', 'eBay', 'Instagram', 'TikTok', 'DoorDash', 'Uber', 'Eats', 'Grubhub', 'PricingLink', 'Jobbers', 'FoodShot', 'AI', 'Apple', 'Pay', 'Google', 'iPhone', 'Safari', 'Chrome', 'JPG', 'PNG', 'WebP', 'MB', 'px', 'shotviva', 'API', 'PS'])
const PAGES = {
  '/zh': zhHomePage,
  '/zh/image-to-image-generator': zhImageToImageGenerator,
  '/zh/commercial-photography': zhCommercialPhotography,
  '/zh/ai-restaurant-menu': zhAiRestaurantMenu,
  '/zh/pricing': zhPricingPage,
}

describe('/zh marketing copy (建站规格 §6.1, G13)', () => {
  it('passes the TDK / direct-answer rules, measured in Chinese', () => {
    // Measured as served, with 「最多 6 张」 (the longest) and the no-catalogue 「3 张」 (T91).
    for (const facts of [{ from: 1, same: false }, FALLBACK_CREDITS]) {
      expect(validateContentPage(fillCredits(zhHomePage, facts), 'zh')).toEqual([])
      expect(validateContentPage(fillCredits(zhImageToImageGenerator, facts), 'zh')).toEqual([])
      expect(fillCredits(zhPricingPage.description, facts).length).toBeLessThanOrEqual(80)
    }
    expect(zhPricingPage.title.length).toBeLessThanOrEqual(30)
  })

  it.skipIf(!keywordMap)('starts each Title and H1 with the keyword from the Chinese keyword map, unbroken', () => {
    const keywords = zhKeywords()
    for (const [url, page] of Object.entries(PAGES)) {
      const keyword = (keywords.get(url) ?? '').toLowerCase()
      expect(keyword, url).not.toBe('')
      expect(page.title.toLowerCase().startsWith(keyword), `${url} title`).toBe(true)
      expect(page.h1.toLowerCase().startsWith(keyword.split(' ')[0] ?? keyword), `${url} h1`).toBe(true)
    }
  })

  it('quotes prices in US dollars only, never RMB', () => {
    const text = Object.values(PAGES).flatMap(strings).join('\n')
    expect(text).not.toMatch(/人民币|RMB|CNY|¥|￥|\d\s*元/)
    expect(text).toContain('$')
  })

  it('writes one language per page', () => {
    const pages = Object.values(PAGES).map((page) => ({ ...fillCredits(page, FALLBACK_CREDITS), hero: undefined, path: undefined }))
    const words = pages.flatMap(strings).flatMap((text) => text.match(/[A-Za-z][A-Za-z']*/g) ?? [])
    expect([...new Set(words.filter((word) => !LATIN_OK.has(word)))]).toEqual([])
  })
})

describe('yearly saving wording', () => {
  it('quotes offer.ts\'s largest yearly saving as 「最多省」, never a typed number', async () => {
    const { zhYearlySaving } = await import('./offer')
    const { yearlySaving } = await import('../offer')
    expect(zhYearlySaving).toBe(`按年付最多省 ${yearlySaving}%`)
  })
})

// SEO launch handbook G9 (Owner 2026-11-11).
describe('/zh home title, description and white-background guide', () => {
  it('names AI改图 and AI修图 and keeps the subject-unchanged promise', () => {
    expect(zhHomePage.title).toBe('AI改图·AI修图：主体不变，更换光线、场景或画风')
    expect(zhHomePage.description.startsWith('AI改图 / AI修图：')).toBe(true)
    expect(zhHomePage.description).toContain('白底商品图、电商主图和菜单图')
  })

  it('adds the 「白底图、电商主图怎么做」 H2 with three cards', () => {
    expect(zhHomePage.topics?.heading).toBe('白底图、电商主图怎么做')
    expect(zhHomePage.topics?.cards.map((card) => card.heading)).toEqual(['选「纯白底图」模板', '商品主体保持原样', '3 档导出尺寸'])
  })
})
