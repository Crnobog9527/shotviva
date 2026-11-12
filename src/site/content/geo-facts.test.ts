import { describe, expect, it } from 'vitest'

import { site } from '../site.config'
import { isQuotableFact, MIN_QUOTABLE_FACTS, quotableFacts } from './geo-facts'
import { contentPagesIn, findContentPageIn, homePageIn, pricingFaqIn, pricingPageIn } from './localized'
import { photoSeconds } from './offer'

const products = site.billing.products
const zhIndexable = new Set<string>(site.indexing.zhIndexablePaths)

function indexablePages() {
  const pages: { name: string; page: unknown; vertical: boolean }[] = []
  for (const locale of ['en', 'zh'] as const) {
    pages.push({ name: `${locale} home`, page: homePageIn(locale, products), vertical: false })
    const pricing = pricingPageIn(locale, products)
    pages.push({ name: `${locale} pricing`, page: [pricing, pricingFaqIn(locale, 'stripe', false, pricing)], vertical: false })
    for (const { slug } of contentPagesIn(locale)) {
      if (locale === 'zh' && !zhIndexable.has(`/${slug}`)) continue
      pages.push({ name: `${locale} /${slug}`, page: findContentPageIn(slug, locale, products), vertical: true })
    }
  }
  return pages
}

describe('GEO facts (SEO launch handbook 03-S3)', () => {
  it.each(indexablePages())(`$name carries at least ${MIN_QUOTABLE_FACTS} quotable facts`, ({ page }) => {
    expect(quotableFacts(page).length).toBeGreaterThanOrEqual(MIN_QUOTABLE_FACTS)
  })

  // Each vertical page: a processing time, a starting price and a dated platform rule or cost bill.
  it.each(indexablePages().filter((entry) => entry.vertical))('$name states the time per photo and a starting price', ({ page }) => {
    const facts = quotableFacts(page)
    expect(facts.some((fact) => fact.includes(`${photoSeconds} seconds`) || fact.includes(`${photoSeconds} 秒`))).toBe(true)
    expect(facts.some((fact) => /\$\d+(?:\.\d\d)? a month|每月 \$\d/.test(fact))).toBe(true)
    expect(facts.some((fact) => /November 2026|2026 年 11 月|2026/.test(fact))).toBe(true)
  })

  it('no FAQ answer on a vertical or pricing page opens with It / This / Yes / No', () => {
    const answers: string[] = []
    for (const locale of ['en'] as const) {
      const pricing = pricingPageIn(locale, products)
      answers.push(...pricingFaqIn(locale, 'stripe', false, pricing).map((item) => item.answer))
      for (const { slug } of contentPagesIn(locale)) answers.push(...(findContentPageIn(slug, locale, products)?.faq ?? []).map((item) => item.answer))
    }
    expect(answers.filter((answer) => /^(?:It|This|Yes|No)\b/.test(answer))).toEqual([])
  })

  it('a quotable fact has a number, a real subject and enough words', () => {
    expect(isQuotableFact('Shotviva makes each photo in about 60 seconds.')).toBe(true)
    expect(isQuotableFact('It makes each photo in about 60 seconds.')).toBe(false)
    expect(isQuotableFact('Yes. Credit packs start at $9.90 and never expire.')).toBe(false)
    expect(isQuotableFact('Shotviva makes each photo quickly and well.')).toBe(false)
    expect(isQuotableFact('About 60 seconds.')).toBe(false)
    expect(isQuotableFact('Shotviva 每张图大约 60 秒出图。')).toBe(true)
  })
})
