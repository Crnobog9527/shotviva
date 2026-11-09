import type { MembershipProduct, SiteProduct } from '../../config'
import type { SubscriptionSummary } from './summary'

// What the account page's membership pass and credit dial need beyond the mirror (comps-v3-b/
// account.html): which membership was bought last and how, and how many paid credits a period
// of the current plan brings. Pure; the payments come from the list the page already reads.

// cn_card = 中国银行卡, the zh pages' plain Stripe card route (T64); wechat_pay since T73.
export type PaymentMethod = 'card' | 'alipay' | 'wechat_pay' | 'cn_card'
export type PaymentFact = { productId: string; method: PaymentMethod; grantedCredits?: number | null }
export type LastMembership = { product: MembershipProduct; method: PaymentMethod; grantedCredits?: number | null }

// Newest first, as the payments list is ordered: the first membership purchase (packs skipped).
export function lastMembership(payments: readonly PaymentFact[], products: readonly SiteProduct[]): LastMembership | null {
  for (const payment of payments) {
    const product = products.find((p) => p.id === payment.productId)
    if (product && product.tier !== 'pack') return { product, method: payment.method, grantedCredits: payment.grantedCredits }
  }
  return null
}

export type Allowance = { credits: number; interval: 'month' | 'year' }

// Paid credits one period of the plan brings: the subscribed product, or for a one-period
// member the product they last bought when it is the same tier. No plan, no allowance.
export function planAllowance(summary: SubscriptionSummary, last: LastMembership | null): Allowance | null {
  if (last?.grantedCredits == null || (summary.kind !== 'subscription' && summary.kind !== 'paid_until') || summary.tier !== last.product.tier) return null
  if (summary.kind === 'subscription' && last.product.interval !== summary.interval) return null
  return { credits: last.grantedCredits, interval: last.product.interval }
}
