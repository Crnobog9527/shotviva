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
    // Largest yearly saving, rounded: Max 39.98% → 40 (DESIGN §6.9).
    expect(yearlySaving).toBe(40)
  })

  it('fills the /pricing title, lede and credit costs from config', () => {
    expect(pricingPage.title).toBe('Shotviva Pricing: Plans From $19.90 a Month')
    expect(pricingPage.intro).toContain('A photo costs from 2 credits')
    expect(pricingPage.intro).toContain('Yearly plans save up to 40%.')
    expect(pricingPage.intro).toContain('Credit packs start at $9.90.')
    expect(pricingPage.gift).toBe('New users get 3 free Standard images. No card needed.')
    expect(pricingPage.creditBuys.tiers).toEqual([
      { name: 'Standard', credits: 2 },
      { name: 'HD', credits: 4 },
      { name: 'Max', credits: 6 },
    ])
    expect(pricingPage.creditBuys.note).toContain('1024, 2048 or 2880 px')
    expect(perCredit('starter_monthly')).toBe('$0.40')
  })
})
