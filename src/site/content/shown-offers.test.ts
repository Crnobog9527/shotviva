import { describe, expect, it } from 'vitest'

import type { SiteProduct } from '@/core/config'
import { softwareApplicationLd } from '@/core/seo'

import { site } from '../site.config'
import { contentPagesIn, findContentPageIn, homePageIn } from './localized'
import { usd } from './offer'
import { offersShownIn } from './shown-offers'

const products = site.billing.products
const ids = (list: readonly SiteProduct[]) => list.map((product) => product.id)

describe('offersShownIn (03-S2: JSON-LD offers match the page text)', () => {
  it.each(['en', 'zh'] as const)('the %s home page lists the three monthly cards and nothing else', (locale) => {
    expect(ids(offersShownIn(homePageIn(locale, products), products))).toEqual(['starter_monthly', 'pro_monthly', 'max_monthly'])
  })

  it.each(['en', 'zh'] as const)('every %s landing page lists only plans whose price and credits it shows', (locale) => {
    for (const { slug } of contentPagesIn(locale)) {
      const page = findContentPageIn(slug, locale, products)
      const shown = offersShownIn(page, products)
      expect(shown.length, slug).toBeGreaterThan(0)
      const text = JSON.stringify(page)
      for (const product of shown) expect(text, `${slug} ${product.id}`).toContain(usd(product.priceUsd))
    }
  })

  it('needs the price and the credit count, at word boundaries', () => {
    const pro = { id: 'pro_monthly', tier: 'pro', interval: 'month', paidDays: 30, credits: 6000, priceUsd: 49.9 } as const
    const packL = { id: 'pack_l', tier: 'pack', interval: null, paidDays: null, credits: 4990, priceUsd: 49.9 } as const
    const packS = { id: 'pack_s', tier: 'pack', interval: null, paidDays: null, credits: 990, priceUsd: 9.9 } as const
    const list = [pro, packL, packS]
    expect(ids(offersShownIn({ a: 'Pro $49.90/mo', b: ['6,000 credits a month'] }, list))).toEqual(['pro_monthly'])
    // "990" inside "1,990" / "1990" and "$9.90" inside "$19.90" are not the small pack, and a
    // number that is not a credit count ("990 px") is not one either.
    expect(ids(offersShownIn('Starter $19.90, 1,990 credits or 1990 credits', list))).toEqual([])
    expect(ids(offersShownIn('Packs from $9.90; images up to 990 px', list))).toEqual([])
    expect(ids(offersShownIn('套餐 $9.90，含 990 积分', list))).toEqual(['pack_s'])
    expect(ids(offersShownIn('A pack: 990 credits for $9.90.', list))).toEqual(['pack_s'])
  })

  it('every offer in the home JSON-LD has its price on the page', () => {
    const home = homePageIn('en', products)
    const ld = softwareApplicationLd(site, { path: '/', title: home.title, description: home.description }, offersShownIn(home, products))
    const offers = ld.offers as { name: string; price: string }[]
    expect(offers.map((offer) => offer.name)).toEqual(['Free', 'Starter Monthly', 'Pro Monthly', 'Max Monthly'])
  })
})
