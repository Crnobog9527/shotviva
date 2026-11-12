import { describe, expect, it, vi } from 'vitest'

import { pageGate } from '@/core/content'
import { llmsTxt } from '@/core/seo'

import { site } from '../site.config'
import { llmsPricingLine } from './llms-pages'
import { homePageIn } from './localized'

vi.mock('@/core/seo/indexing-now', () => ({ indexingOpenNow: () => true }))

const products = site.billing.products

describe('/llms.txt additions (SEO patch v5 item 5)', () => {
  it('sums up /pricing with the three monthly prices from the catalog', () => {
    const line = llmsPricingLine(products)
    expect(line?.path).toBe('/pricing')
    expect(line?.description).toMatch(/^Shotviva plans: Starter \$19\.90, Pro \$49\.90 and Max \$99 a month; one-time credit packs from \$9\.90\./)
  })

  it('has no pricing line while a monthly plan is unpublished', () => {
    expect(llmsPricingLine(products.filter((p) => p.id !== 'pro_monthly'))).toBeUndefined()
  })

  it('lists /pricing and the Chinese home page after the existing entries', () => {
    const home = homePageIn('en', products)
    const zh = homePageIn('zh', products)
    const text = llmsTxt(site, 'Summary.', [
      { ...pageGate(home), title: home.title, description: home.description },
      llmsPricingLine(products)!,
      { ...pageGate(zh), locale: 'zh', title: zh.title, description: zh.description },
    ])
    const links = [...text.matchAll(/\]\((https:[^)]+)\)/g)].map((m) => m[1])
    expect(links).toEqual(['https://shotviva.com/', 'https://shotviva.com/pricing', 'https://shotviva.com/zh'])
  })
})
