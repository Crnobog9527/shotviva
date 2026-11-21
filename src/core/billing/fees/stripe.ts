import 'server-only'

import type Stripe from 'stripe'

import type { StripeApi } from '../stripe/client'
import type { RpcClient } from '../rpc'
import { feeTarget, outcomeOf, priced, safely, writeFees, type FeeLine, type FeeOutcome, type FeeSchedule, type FeeTarget, type FeeWrite } from './record'

// F3, Stripe (ARCHITECTURE §6.2 订单手续费, F1 measurements). The charge's balance transaction is
// the real bill: it exists the moment the charge succeeds and its fee is final then. Only
// fee_details of type `stripe_fee` are fees — a Managed Payments card charge's `fee` also holds
// the withheld sales tax (`withheld_tax`), which the commission has already taken out. That total
// is split for the affiliate into the published items: a `Stripe currency conversion fee` detail
// is the FX line as Stripe gave it, the international-card surcharge is priced from its rate,
// and the acquiring line takes what is left (rounding included), so the lines add up to exactly
// what Stripe took. Managed Payments 3.5%, Billing 0.7% and Radar $0.05 are never on the charge
// (Stripe books them as unattributed daily totals), so they are formula lines, estimated until
// the daily reconciliation (F4) matches them.

// The account's country: a card issued anywhere else pays the international surcharge.
const ACCOUNT_COUNTRY = 'US'

const CONVERSION = /currency conversion/i

const sum = (items: readonly { amount: number }[]) => items.reduce((total, item) => total + item.amount, 0)

// Stripe rounds half up.
const rateOf = (basis: number, rate: FeeSchedule | undefined) =>
  rate ? Math.floor((basis * rate.rate_bp + 5000) / 10000) + rate.fixed_cents : 0

function balanceOf(charge: Stripe.Charge | null): Stripe.BalanceTransaction | null {
  const bt = charge?.balance_transaction
  return bt && typeof bt === 'object' ? bt : null
}

// 中国银行卡 cards are issued in China; a card-group charge says where its card was issued
// (unknown: maybe — the bill decides). Wallets (Alipay, WeChat Pay) pay no card surcharge.
function international(method: string, charge: Stripe.Charge | null): boolean | 'maybe' {
  if (method === 'cn_card') return true
  if (method !== 'card') return false
  const country = charge?.payment_method_details?.card?.country
  return country ? country !== ACCOUNT_COUNTRY : 'maybe'
}

export type StripeFeeFacts = {
  // A Stripe Billing invoice (a subscription's first payment or a renewal): Billing 0.7% applies.
  subscription: boolean
  // The Checkout Session's managed_payments.enabled when known (null on a renewal).
  managedPayments: boolean | null
}

function formulaLines(target: FeeTarget, managed: boolean, facts: StripeFeeFacts, ref: string | undefined): FeeLine[] {
  const source = 'formula' as const
  return [
    managed ? priced(target, 'mp', source, { source_ref: ref }) : null,
    facts.subscription ? priced(target, 'billing', source, { source_ref: ref }) : null,
    // Radar is part of the Managed Payments fee; every other screened charge pays it.
    managed ? null : priced(target, 'radar', source, { source_ref: ref }),
  ].filter((line): line is FeeLine => line !== null)
}

// The lines for one Stripe charge, or null when there is nothing safe to write (no USD figure).
export function stripeFeeWrite(target: FeeTarget, charge: Stripe.Charge | null, facts: StripeFeeFacts): FeeWrite | null {
  const bt = balanceOf(charge)
  if (bt && bt.currency === 'usd') return realBill(target, charge as Stripe.Charge, bt, facts)
  // No balance transaction yet (a delayed method) or not in USD: estimate from the published
  // rates on what was charged, when that is USD; the reconciliation replaces it with the bill.
  if (target.currency !== 'usd') return null
  return estimated(target, charge, facts)
}

function realBill(target: FeeTarget, charge: Stripe.Charge, bt: Stripe.BalanceTransaction, facts: StripeFeeFacts): FeeWrite {
  const details = bt.fee_details ?? []
  const fees = details.filter(d => d.type === 'stripe_fee')
  const actual = sum(fees)
  const fx = sum(fees.filter(d => CONVERSION.test(d.description ?? '')))
  const basis = bt.amount
  const managed = facts.managedPayments === true || details.some(d => d.type === 'withheld_tax')
  const ref = bt.id
  const real = [
    fxLine(target, bt, fx),
    intlLine(target, charge, basis, actual - fx, ref),
    { ...priced(target, 'acquiring', 'stripe_bt'), kind: 'acquiring', source: 'stripe_bt', source_ref: ref } as FeeLine,
  ].filter((line): line is FeeLine => line !== null)
  return {
    payment_id: target.payment_id,
    idempotency_key: `stripe_bt:${bt.id}`,
    basis_cents: basis,
    actual_cents: actual,
    lines: [...real, ...formulaLines(target, managed, facts, charge.id)],
  }
}

// Stripe's own conversion detail, as given; else, when Stripe converted, the published 1%.
function fxLine(target: FeeTarget, bt: Stripe.BalanceTransaction, given: number): FeeLine | null {
  if (given > 0) return { ...priced(target, 'fx', 'stripe_bt'), kind: 'fx', source: 'stripe_bt', amount_cents: given, source_ref: bt.id }
  const converted = bt.exchange_rate !== null && bt.exchange_rate !== undefined
  return converted ? priced(target, 'fx', 'stripe_bt', { source_ref: bt.id }) : null
}

// The surcharge only where the processing part of the bill shows it (within a cent of rounding),
// so a domestic card is never shown a surcharge it did not pay.
function intlLine(target: FeeTarget, charge: Stripe.Charge, basis: number, processing: number, ref: string): FeeLine | null {
  const acquiring = rateOf(basis, target.schedules.acquiring)
  const intl = rateOf(basis, target.schedules.intl_card)
  if (international(target.method, charge) === false || intl === 0 || processing < acquiring + intl - 1) return null
  return priced(target, 'intl_card', 'stripe_bt', { source_ref: ref })
}

function estimated(target: FeeTarget, charge: Stripe.Charge | null, facts: StripeFeeFacts): FeeWrite | null {
  const acquiring = priced(target, 'acquiring', 'estimate')
  if (!acquiring) return null
  const intl = international(target.method, charge) === true ? priced(target, 'intl_card', 'estimate') : null
  const managed = facts.managedPayments === true
  return {
    payment_id: target.payment_id,
    idempotency_key: `estimate:${target.payment_id}`,
    basis_cents: target.amount_total,
    lines: [acquiring, ...(intl ? [intl] : []), ...formulaLines(target, managed, facts, charge?.id)],
  }
}

export type StripeFeeDeps = { stripe: Pick<StripeApi, 'charges'>; db: RpcClient }

// After settle_checkout / apply_subscription_renewal: `ref` is the session (cs_) or invoice (in_)
// the payments row is keyed by. `charge` is the session's already expanded charge when it
// carries its balance transaction; otherwise the charge is read once more (an invoice's charge
// sits too deep to expand, F1 §2.5). Never throws.
export function recordStripeFees(
  deps: StripeFeeDeps,
  at: { ref: string; chargeId: string | null; charge?: Stripe.Charge | null } & StripeFeeFacts,
): Promise<FeeOutcome> {
  return safely({ channel: 'stripe', ref: at.ref, charge_id: at.chargeId }, async () => {
    const target = await feeTarget(deps.db, { ref: at.ref })
    if (typeof target === 'string') return target
    const charge = balanceOf(at.charge ?? null)
      ? at.charge ?? null
      : at.chargeId ? await deps.stripe.charges.retrieve(at.chargeId, { expand: ['balance_transaction'] }) : null
    const write = stripeFeeWrite(target, charge, at)
    return write ? outcomeOf(await writeFees(deps.db, write)) : 'skipped'
  })
}
