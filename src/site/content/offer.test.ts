import { describe, expect, it } from 'vitest'

import en from '../messages/en.json'
import zh from '../messages/zh.json'
import { site } from '../site.config'
import { fillCredits } from './credits'
import { homePage } from './home'
import { perCredit, photosLeftInPlan, plansSentence, quoteUsd, setCostUsd, usdRange, yearlySaving } from './offer'
import { pricingPage } from './pricing'
import { zhHomePage } from './zh/home'

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
    expect(fillCredits(pricingPage.intro, 1)).toContain('A photo costs from 1 credit,')
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

  it('fills both home bills from config: the photographer rates and the Starter plan (DESIGN §6.9 item 6)', () => {
    // 3 × $50–$350 styled shots; retouching is in the shot price, never a line of its own.
    expect(usdRange(quoteUsd)).toBe('$150–$1,050')
    // 6 credits at Starter's $0.40 a credit, and (50 − 6) ÷ 2 Standard photos left.
    expect(setCostUsd).toBe('$2.40')
    expect(photosLeftInPlan).toBe(22)
    const bills = homePage.costBills
    expect(bills.photographer.total.amount).toBe('$150–$1,050')
    expect(bills.photographer.lines.map((line) => line.label).join(' ')).not.toMatch(/retouch/i)
    expect(bills.photographer.fine).toContain('$50–$350 (Shopify, Jan 2026)')
    expect(bills.photographer.fine).toContain('$15–$90')
    expect(bills.photographer.fine).not.toMatch(/ASMP|association/i)
    expect(bills.site.total.amount).toBe('$19.90')
    expect(bills.site.lines.map((line) => line.value)).toEqual(['$19.90', '6 credits ≈ $2.40', '22 more photos'])
    // One round figure, no range, no quality (Owner 2026-11-06).
    expect(bills.site.total.when).toBe(`about ${site.marketing.photoSecondsApprox} seconds a photo`)
    expect(zhHomePage.costBills.site.total.when).toBe(`每张 ${site.marketing.photoSecondsApprox} 秒左右`)
  })
})

// The app's own hints say the same round figure as the home bill and never a range or a
// quality (Owner 2026-11-06), so retuning site.config means retuning these words too.
describe('how long a photo takes', () => {
  it('says "about N seconds" everywhere, with N from site.config', () => {
    const n = String(site.marketing.photoSecondsApprox)
    const hints = [en, zh].flatMap((m) => [m.app.workspace.leave, m.app.workspace.batch.leave, m.app.photos.usually, m.app.photos.empty])
    for (const hint of hints) {
      expect(hint).toContain(n)
      expect(hint).not.toMatch(/\d\s*[–-]\s*\d|Standard|HD|Max|标准|高清|超清/)
    }
    expect(en.app.workspace.leave).toContain(`about ${n} seconds`)
    expect(zh.app.workspace.leave).toContain(`${n} 秒左右`)
  })
})
