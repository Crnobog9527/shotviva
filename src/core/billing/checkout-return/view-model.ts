import type { MembershipTier, ProductInterval, SiteProduct } from '../../config'
import type { CheckoutMethod } from '../stripe/catalog'
import type { Balance } from '../pools'
import type { CheckoutFacts } from './facts'

// The return page's two states (comps-v3-b checkout.html, T43), from the facts and the config.
// Pure, so every one of the nine products is unit-tested. Cancel never lands here: Stripe's
// cancel_url is /pricing?checkout=cancel, which shows a toast.

export type Money = { minor: number; currency: string }

type Order = { kind: 'plan' | 'pack'; tier: MembershipTier | null; interval: ProductInterval | null; credits: number }

// Which closing line: a card plan that renews (monthly / yearly, where the year's credits are
// all in now), one paid period that does not renew (Alipay, Waffo), or a pack.
export type FineKey = 'fineMonthly' | 'fineYearly' | 'finePeriod' | 'finePack'

export type SuccessView = Order & {
  state: 'success'
  balance: number
  renews: { at: string; priceUsd: number } | null
  paid: (Money & { method: CheckoutMethod | null; card: { brand: string; last4: string } | null }) | null
  receiptUrl: string | null
  fine: FineKey
}

export type PendingView = Order & { state: 'pending'; amount: Money | null; method: CheckoutMethod | null }

export type ReturnView = SuccessView | PendingView

function orderOf(product: SiteProduct): Order {
  return product.tier === 'pack'
    ? { kind: 'pack', tier: null, interval: null, credits: product.credits }
    : { kind: 'plan', tier: product.tier, interval: product.interval, credits: product.credits }
}

export function fineKey(order: Order, renews: boolean): FineKey {
  if (order.kind === 'pack') return 'finePack'
  if (!renews) return 'finePeriod'
  return order.interval === 'year' ? 'fineYearly' : 'fineMonthly'
}

export function returnView(facts: CheckoutFacts, product: SiteProduct, balance: Balance): ReturnView {
  const order = orderOf(product)
  if (!facts.settled) {
    // Before the webhook lands the amount is the session's; with no session (Waffo) the price.
    const amount = facts.amount ?? { minor: Math.round(product.priceUsd * 100), currency: 'usd' }
    return { ...order, state: 'pending', amount, method: facts.method }
  }
  const renews = order.kind === 'plan' && facts.renewsAt ? { at: facts.renewsAt, priceUsd: product.priceUsd } : null
  return {
    ...order,
    state: 'success',
    balance: balance.paid + balance.free,
    renews,
    paid: facts.amount ? { ...facts.amount, method: facts.method, card: facts.card } : null,
    receiptUrl: facts.receiptUrl,
    fine: fineKey(order, renews !== null),
  }
}

// An amount in the smallest unit as a number to format: USD cents → dollars, and Stripe's
// zero-decimal currencies (Adaptive Pricing can charge in one) as they are.
const ZERO_DECIMAL = new Set(['bif', 'clp', 'djf', 'gnf', 'jpy', 'kmf', 'krw', 'mga', 'pyg', 'rwf', 'ugx', 'vnd', 'vuv', 'xaf', 'xof', 'xpf'])

export function majorUnits(money: Money): number {
  return ZERO_DECIMAL.has(money.currency.toLowerCase()) ? money.minor : money.minor / 100
}

// "visa" → "Visa", "american_express" → "American Express" (the brand Stripe reports).
export function brandName(brand: string): string {
  return brand
    .split(/[_\s]+/)
    .map((word) => (word ? word[0]?.toUpperCase() + word.slice(1) : word))
    .join(' ')
}
