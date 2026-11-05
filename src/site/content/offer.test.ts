import { describe, expect, it, vi } from 'vitest'

// The nine products as ARCHITECTURE §6.2 fixes them. T9 writes these into site.config; this
// test proves the copy fills in from them once it does, without anyone touching the copy.
vi.mock('../site.config', async (importOriginal) => {
  const { site } = await importOriginal<typeof import('../site.config')>()
  const products = [
    { id: 'starter_monthly', credits: 50, priceUsd: 19.9 },
    { id: 'starter_yearly', credits: 600, priceUsd: 139 },
    { id: 'pro_monthly', credits: 135, priceUsd: 49.9 },
    { id: 'pro_yearly', credits: 1620, priceUsd: 349 },
    { id: 'max_monthly', credits: 280, priceUsd: 99 },
    { id: 'max_yearly', credits: 3360, priceUsd: 699 },
    { id: 'pack_s', credits: 20, priceUsd: 9.9 },
    { id: 'pack_m', credits: 55, priceUsd: 24.9 },
    { id: 'pack_l', credits: 115, priceUsd: 49.9 },
  ].map((p) => ({ ...p, paidDays: 30 }))
  return { site: { ...site, billing: { ...site.billing, products } } }
})

const { homePage } = await import('./home')
const { pricingPage } = await import('./pricing')
const { perCredit, plansSentence, yearlySaving } = await import('./offer')

describe('copy with the T9 catalog in site.config', () => {
  it('fills the home plans heading and sentence from config', () => {
    expect(homePage.freeOffer.plans.heading).toBe('Plans From $19.90 a Month')
    expect(plansSentence()).toBe(
      'Plans start at $19.90 a month for 50 credits, or buy a one-time credit pack from $9.90.',
    )
    expect(yearlySaving).toBe(41)
  })

  it('fills the /pricing tables and title from config', () => {
    expect(pricingPage.title).toBe('Shotviva Pricing: Plans From $19.90 a Month')
    expect(pricingPage.tables.plans.rows).toEqual([
      ['Starter', '$19.90', '50', '$139', '600', '$0.23'],
      ['Pro', '$49.90', '135', '$349', '1,620', '$0.22'],
      ['Max', '$99', '280', '$699', '3,360', '$0.21'],
    ])
    expect(pricingPage.tables.packs.rows[0]).toEqual(['Small pack', '$9.90', '20', '$0.50'])
    expect(perCredit('starter_monthly')).toBe('$0.40')
  })
})
