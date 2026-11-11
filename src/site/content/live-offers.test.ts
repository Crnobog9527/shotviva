import { expect, it } from 'vitest'

import type { SiteProduct } from '@/core/config'
import { softwareApplicationLd } from '@/core/seo'
import { site } from '../site.config'
import { contentPagesIn, findContentPageIn, homePageIn } from './localized'

const changed: SiteProduct[] = [
  { id: 'pro_monthly', tier: 'pro', interval: 'month', paidDays: 30, credits: 4321, priceUsd: 36.54 },
  { id: 'pack_s', tier: 'pack', interval: null, paidDays: null, credits: 321, priceUsd: 8.76 },
]

it.each(['en', 'zh'] as const)('uses the listed offers on the %s home and landing pages', locale => {
  const home = homePageIn(locale, changed)
  expect(home.freeOffer.plans.text).toContain('$36.54')
  expect(home.freeOffer.plans.text).toContain('$8.76')
  // The home bills leave the plan line to the plan strip, which needs all three monthly plans.
  expect(home.costBills.site.total.amount).toEqual('$36.54')
  expect(home.plans).toBeUndefined()
  for (const { slug } of contentPagesIn(locale)) {
    const page = findContentPageIn(slug, locale, changed)
    expect(page?.costBills?.site.total.amount).toEqual('$36.54')
    expect(JSON.stringify(page)).not.toContain('$19.90')
  }
  expect(softwareApplicationLd(site, { path: '/', title: home.title, description: home.description }, changed).offers)
    .toMatchObject([{ price: '0' }, { name: 'Pro Monthly', price: '36.54' }, { name: 'Credit Pack, 321 credits', price: '8.76' }])
})
