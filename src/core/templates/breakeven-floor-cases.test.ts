import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { privateDoc } from '../../../tests/support/private-docs'
import { minimumCredits } from './provider-pricing'

// 1568: the break-even floor against the pricing desk's cases and the Owner's prices. Prices, costs
// and rates live only in the private docs repo (docs/pricing/template-floor-cases.json); CI has no
// copy and skips.
type Product = { id: string; cents: number; credits: number; kind: 'pack' | 'monthly' | 'yearly' }
type Case = { name: string; worstCostUsd: number; oldFloor: number; newFloor: number; ownerPrices: number[] }
type Cases = {
  policy: { payment_bp: number; refund_bp: number; margin_bp: number }
  worstCommissionBp: Record<Product['kind'], number>
  memberPackFactor: number
  products: Product[]
  cases: Case[]
}

const path = privateDoc('docs', 'pricing', 'template-floor-cases.json')
const data = path ? JSON.parse(readFileSync(path, 'utf8')) as Cases : null

// The same min as admin.template_breakeven_budget: realised dollars per credit after each product
// kind's worst fee (packs M/L at the member price).
function breakevenBudget(d: Cases) {
  return Math.min(...d.products.map(p => {
    const cents = ['pack_m', 'pack_l'].includes(p.id) ? Math.round(p.cents * d.memberPackFactor) : p.cents
    const fee = d.policy.payment_bp + d.policy.refund_bp + d.worstCommissionBp[p.kind]
    return cents / (100 * p.credits) * (10000 - fee) / 10000
  }))
}

describe.skipIf(!data)('break-even floor cases (private)', () => {
  it.each(data?.cases ?? [])('$name', c => {
    const d = data!
    expect(minimumCredits(c.worstCostUsd, breakevenBudget(d))).toBe(c.newFloor)
    for (const price of c.ownerPrices) expect(price).toBeGreaterThanOrEqual(c.newFloor)
    expect(c.newFloor).toBeLessThanOrEqual(c.oldFloor)
  })
})
