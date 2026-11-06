import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { validateContentPage } from '@/core/content'

import { zhHomePage } from './home'
import { zhImageToImageGenerator } from './pages/image-to-image-generator'
import { zhPricingPage } from './pricing'

// The Chinese keyword map (T22): URL → keyword, the source of every /zh Title and H1.
function zhKeywords(): Map<string, string> {
  const csv = readFileSync(join(process.cwd(), 'seo资料', 'Shotviva 页面与主词映射（中文口径）.csv'), 'utf8')
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
  // Addresses and ids are not copy: slugs, hrefs and module ids stay English (建站规格 R4).
  if (value && typeof value === 'object') {
    return Object.entries(value)
      .filter(([key]) => !['slug', 'href', 'path', 'module', 'src'].includes(key))
      .flatMap(([, inner]) => strings(inner))
  }
  return []
}

// Latin words allowed on a Chinese page (建站规格 §6.1 rule 3): the brand, AI, payment, phone,
// browser and file-format names, units. Image paths and alt text of the shared placeholders are skipped.
const LATIN_OK = new Set(['Shotviva', 'AI', 'Apple', 'Pay', 'Google', 'iPhone', 'Safari', 'Chrome', 'JPG', 'PNG', 'WebP', 'MB', 'px', 'shotviva'])
const PAGES = { '/zh': zhHomePage, '/zh/image-to-image-generator': zhImageToImageGenerator, '/zh/pricing': zhPricingPage }

describe('/zh marketing copy (建站规格 §6.1, G13)', () => {
  it('passes the TDK / direct-answer rules, measured in Chinese', () => {
    expect(validateContentPage(zhHomePage, 'zh')).toEqual([])
    expect(validateContentPage(zhImageToImageGenerator, 'zh')).toEqual([])
    expect(zhPricingPage.title.length).toBeLessThanOrEqual(30)
    expect(zhPricingPage.description.length).toBeLessThanOrEqual(80)
  })

  it('starts each Title and H1 with the keyword from the Chinese keyword map, unbroken', () => {
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
    const pages = Object.values(PAGES).map((page) => ({ ...page, hero: undefined, path: undefined }))
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
