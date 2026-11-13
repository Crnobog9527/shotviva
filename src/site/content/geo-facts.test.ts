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
      // The time-and-price sentences are required on the English verticals and /zh's generator.
      // /zh/commercial-photography and /zh/ai-restaurant-menu became indexable with SEO patch v5,
      // which freezes copy for the 4-week index watch; they get theirs after it (5+ facts already).
      const vertical = locale === 'en' || slug === 'image-to-image-generator'
      pages.push({ name: `${locale} /${slug}`, page: findContentPageIn(slug, locale, products), vertical })
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
    // The platform rules' check date, as the page prints it: "checked November 2026" / "2026 年 11 月核对".
    expect(facts.some((fact) => /checked (?:January|February|March|April|May|June|July|August|September|October|November|December) \d{4}|\d{4} 年 \d{1,2} 月核对/.test(fact))).toBe(true)
  })

  // English: It / This / Yes / No. Chinese: 它 / 这 / 是的, or a bare short reply such as 可以。
  // 不会。不用。归你。 (three characters or fewer before the first full stop or comma).
  const VAGUE_OPENING = { en: /^(?:It|This|Yes|No)\b/, zh: /^(?:它|这|是的)|^[^。，、：]{1,3}[。，]/ } as const

  it('the opening rule catches bare replies and lets real answers through', () => {
    for (const bare of ['可以。积分包是一次性付款。', '不会。付费积分永不过期。', '归你。用付费积分生成的图私密。', '它做的是照片。']) expect(VAGUE_OPENING.zh.test(bare), bare).toBe(true)
    for (const fine of ['看你要什么。想自己调模型…', 'Shotviva 支持支付宝付款：…', '付费积分永不过期，套餐续费时…']) expect(VAGUE_OPENING.zh.test(fine), fine).toBe(false)
    expect(VAGUE_OPENING.en.test('No. You pick a template.')).toBe(true)
    expect(VAGUE_OPENING.en.test('Nobody needs a prompt.')).toBe(false)
  })

  it.each(['en', 'zh'] as const)('no %s FAQ answer on a vertical or pricing page opens with a bare reply', (locale) => {
    const pricing = pricingPageIn(locale, products)
    const answers = [
      ...pricingFaqIn(locale, 'stripe', false, pricing),
      ...pricingFaqIn(locale, 'stripe', true, pricing),
      ...pricing.waffo.faq,
      ...contentPagesIn(locale).flatMap(({ slug }) => findContentPageIn(slug, locale, products)?.faq ?? []),
    ].map((item) => item.answer)
    expect(answers.filter((answer) => VAGUE_OPENING[locale].test(answer))).toEqual([])
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
