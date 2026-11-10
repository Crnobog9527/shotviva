import { describe, expect, it } from 'vitest'

import { homePage } from './home'
import { homePlans, zhHomePlans } from './plan-strip'
import { zhHomePage } from './zh/home'

// SEO launch handbook G10: three monthly plans under the two bills, all pointing to /pricing,
// with no photo counts (Owner, #417).
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
    expect(homePage.plans).toBe(homePlans)
    expect(zhHomePage.plans).toBe(zhHomePlans)
  })
})
