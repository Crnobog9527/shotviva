import { describe, expect, it } from 'vitest'

import { homePage } from './home'
import { perCredit, plansSentence, yearlySaving } from './offer'
import { pricingPage } from './pricing'

// The copy fills in from the nine products in site.config (ARCHITECTURE §6.2) without anyone
// typing a number into it (建站规格 G3).
describe('copy with the catalog in site.config', () => {
  it('fills the home plans heading and sentence from config', () => {
    expect(homePage.freeOffer.plans.heading).toBe('Plans From $19.90 a Month')
    expect(plansSentence()).toBe(
      'Plans start at $19.90 a month for 50 credits, or buy a one-time credit pack from $9.90.',
    )
    // Largest yearly saving, rounded down: Max 39.98% (DESIGN §6.9).
    expect(yearlySaving).toBe(39)
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
    expect(pricingPage.intro).toContain('Yearly plans save up to 39%.')
  })
})
