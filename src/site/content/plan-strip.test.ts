import { describe, expect, it } from 'vitest'

import { site } from '../site.config'
import { homePage, makeHomePage } from './home'
import { offerFacts } from './offer'
import { homePlans as livePlans, zhHomePlans as liveZhPlans } from './plan-strip'
import { zhHomePage } from './zh/home'

// SEO launch handbook G10: three monthly plans under the two bills, all pointing to /pricing,
// with no photo counts (Owner, #417).
const homePlans = livePlans(site.billing.products)
const zhHomePlans = liveZhPlans(site.billing.products)

describe('home plan strip', () => {
  it('shows Starter, Pro and Max with price, credits and concurrency from config', () => {
    expect(homePlans?.cards.map((card) => card.name)).toEqual(['Starter', 'Pro', 'Max'])
    expect(homePlans?.cards[0]).toEqual({
      name: 'Starter',
      price: '$19.90',
      per: '/mo',
      credits: '1,990 credits a month',
      concurrency: '1 photo generating at a time',
    })
    expect(homePlans?.cards[2].concurrency).toBe('6 photos generating at a time')
    expect(zhHomePlans?.cards[1]).toMatchObject({ name: '专业版', credits: '每月 6,000 积分', concurrency: '同时生成 3 张' })
  })

  it('links to /pricing with a "plans" anchor and never counts photos', () => {
    for (const plans of [homePlans, zhHomePlans]) {
      expect(plans?.href).toBe('/pricing')
      expect(JSON.stringify(plans)).not.toMatch(/photos a month|per photo|张图|约/)
    }
    expect(homePlans?.more).toContain('plans')
    expect(homePage.plans).toEqual(homePlans)
    expect(zhHomePage.plans).toEqual(zhHomePlans)
  })

  it('follows the published catalog and hides while a monthly plan is unpublished', () => {
    const repriced = site.billing.products.map((p) => (p.id === 'pro_monthly' ? { ...p, priceUsd: 59.9 } : p))
    expect(makeHomePage(offerFacts(repriced)).plans?.cards[1]?.price).toBe('$59.90')
    const withoutMax = site.billing.products.filter((p) => p.id !== 'max_monthly')
    expect(livePlans(withoutMax)).toBeUndefined()
    expect(makeHomePage(offerFacts(withoutMax)).plans).toBeUndefined()
  })
})
