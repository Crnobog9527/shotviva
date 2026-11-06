import { describe, expect, it } from 'vitest'

import { homePage } from './home'
import { perCredit, photosLeftInPlan, plansSentence, quoteUsd, setCostUsd, usdRange, yearlySaving } from './offer'
import { pricingPage } from './pricing'

// The copy fills in from the nine products in site.config (ARCHITECTURE §6.2) without anyone
// typing a number into it (建站规格 G3).
describe('copy with the catalog in site.config', () => {
  it('fills the home plans heading and sentence from config', () => {
    expect(homePage.freeOffer.plans.heading).toBe('Plans From $19.90 a Month')
    expect(plansSentence()).toBe(
      'Plans start at $19.90 a month for 50 credits, or buy a one-time credit pack from $9.90.',
    )
    // Largest yearly saving, rounded: Max 39.98% → 40 (DESIGN §6.9).
    expect(yearlySaving).toBe(40)
  })

  it('fills the /pricing tables and title from config', () => {
    expect(pricingPage.title).toBe('Shotviva Pricing: Plans From $19.90 a Month')
    expect(pricingPage.tables.plans.rows).toEqual([
      ['Starter', '$19.90', '50', '$191', '600', '$0.32'],
      ['Pro', '$49.90', '135', '$479', '1,620', '$0.30'],
      ['Max', '$99', '280', '$713', '3,360', '$0.21'],
    ])
    expect(pricingPage.tables.packs.rows[0]).toEqual(['Small pack', '$9.90', '20', '$0.50'])
    expect(perCredit('starter_monthly')).toBe('$0.40')
    expect(pricingPage.intro).toContain('Yearly plans save up to 40%.')
  })

  it('fills both home bills from config: the photographer rates and the Starter plan (DESIGN §6.9 item 6)', () => {
    // 3 × $89–$300 styled shots + 3 × $10–$30 retouching.
    expect(usdRange(quoteUsd)).toBe('$297–$990')
    // 6 credits at Starter's $0.40 a credit, and (50 − 6) ÷ 2 Standard photos left.
    expect(setCostUsd).toBe('$2.40')
    expect(photosLeftInPlan).toBe(22)
    const bills = homePage.costBills
    expect(bills.photographer.total.amount).toBe('$297–$990')
    expect(bills.site.total.amount).toBe('$19.90')
    expect(bills.site.lines.map((line) => line.value)).toEqual(['$19.90', '6 credits ≈ $2.40', '22 more photos'])
    expect(bills.site.total.when).toBe('20–40 seconds a photo')
  })
})
