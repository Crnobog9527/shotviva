import type { MembershipProduct, SiteProduct } from '../../config'
import type { SubscriptionSummary } from './summary'

// What the account page's membership pass and credit dial need beyond the mirror (comps-v3-b/
// account.html): which membership was bought last and how, and how many paid credits a period
// of the current plan brings. Pure; the payments come from the list the page already reads.

export type PaymentFact = { productId: string; method: 'card' | 'alipay' }
export type LastMembership = { product: MembershipProduct; method: 'card' | 'alipay' }

// Newest first, as the payments list is ordered: the first membership purchase (packs skipped).
export function lastMembership(payments: readonly PaymentFact[], products: readonly SiteProduct[]): LastMembership | null {
  for (const payment of payments) {
    const product = products.find((p) => p.id === payment.productId)
    if (product && product.tier !== 'pack') return { product, method: payment.method }
  }
  return null
}

export type Allowance = { credits: number; interval: 'month' | 'year' }

// Paid credits one period of the plan brings: the subscribed product, or for a one-period
// member the product they last bought when it is the same tier. No plan, no allowance.
export function planAllowance(summary: SubscriptionSummary, last: LastMembership | null, products: readonly SiteProduct[]): Allowance | null {
  if (summary.kind === 'subscription') {
    const product = products.find((p) => p.tier === summary.tier && p.interval === summary.interval)
    return product && product.interval ? { credits: product.credits, interval: product.interval } : null
  }
  if (summary.kind === 'paid_until' && last && last.product.tier === summary.tier) {
    return { credits: last.product.credits, interval: last.product.interval }
  }
  return null
}
