import 'server-only'

import type Stripe from 'stripe'

import { invoiceChargeId, sessionCharge } from '../../stripe/payment-facts'
import type { FeeWrite } from '../record'
import { stripeFeeWrite } from '../stripe'
import {
  ageDays, carried, HOUR, isFinal, scopeOf, targetOf, unreconciledIssue, writeFresh,
  type Counters, type InputLine, type Issue, type Look, type PaymentView, type ReconcileDeps, type ReconcileStripe, type Scope,
} from './view'

// F4, Stripe, one payment: a payment with no balance-transaction figure (its webhook failed to
// write, or a delayed method had no bill yet) has its charge read again and the bill written the
// way the webhook would (F3 stripeFeeWrite, same key). Its formula lines (MP, Billing, Radar)
// become final from the batches (batches-run.ts); past the window the Owner is told.

export const STRIPE_WINDOW_DAYS = 7
const RECHECK_MS = 3 * HOUR

const objectOf = <T>(value: unknown): T | null => (value && typeof value === 'object' ? (value as T) : null)
const hasBill = (charge: Stripe.Charge | null) => objectOf(charge?.balance_transaction) !== null

async function sessionChargeOf(stripe: ReconcileStripe, sessionId: string): Promise<string | Stripe.Charge | null> {
  const session = await stripe.checkout.sessions.retrieve(sessionId, { expand: ['payment_intent.latest_charge.balance_transaction'] })
  const charge = sessionCharge(session)
  if (charge && hasBill(charge)) return charge
  const intent = objectOf<Stripe.PaymentIntent>(session.payment_intent)
  return charge?.id ?? (typeof intent?.latest_charge === 'string' ? intent.latest_charge : null)
}

async function invoiceChargeOf(stripe: ReconcileStripe, invoiceId: string): Promise<string | null> {
  const invoice = await stripe.invoices.retrieve(invoiceId, { expand: ['payments.data.payment.payment_intent'] })
  return invoiceChargeId(invoice)
}

// The payment's charge with its balance transaction: by the charge id we stored, else through
// the Checkout Session (one expand reaches it) or the invoice (one more read, F1 §2.5).
async function chargeOf(stripe: ReconcileStripe, view: PaymentView): Promise<Stripe.Charge | null> {
  let found: string | Stripe.Charge | null = view.stripe_charge_id
  if (!found && view.stripe_session_id) found = await sessionChargeOf(stripe, view.stripe_session_id)
  else if (!found && view.stripe_invoice_id) found = await invoiceChargeOf(stripe, view.stripe_invoice_id)
  if (!found) return null
  if (typeof found !== 'string') return found
  return stripe.charges.retrieve(found, { expand: ['balance_transaction'] })
}

// A new real-bill set keeps any formula line a batch already made final (that is the real share).
function keepFinalShares(write: FeeWrite, scope: Scope | null): InputLine[] {
  return write.lines.map((line) => {
    if (line.source !== 'formula') return line
    const settled = scope?.lines.find(l => l.kind === line.kind && l.source === 'formula' && l.status === 'final')
    return settled ? carried(settled) : line
  })
}

async function readBill(deps: ReconcileDeps & { stripe: ReconcileStripe }, counters: Counters, view: PaymentView): Promise<PaymentView> {
  const charge = await chargeOf(deps.stripe, view)
  const target = await targetOf(deps, view.payment_id)
  if (!target) return view
  const billed = hasBill(charge)
  const facts = { subscription: !view.product_id.startsWith('pack_'), managedPayments: billed ? null : view.method === 'card' }
  const write = stripeFeeWrite(target, charge, facts)
  // A real bill always; an estimate only when the payment has no fee lines at all.
  if (!write || (!billed && scopeOf(view, null))) return view
  const done = await writeFresh(deps, counters, view, (v) => {
    const scope = scopeOf(v, null)
    if (scope?.lines.some(l => l.source === 'stripe_bt') || (!billed && scope)) return null
    return { ...write, lines: keepFinalShares(write, scope), expected_revision: scope?.revision ?? 0 }
  })
  return done.view
}

export async function lookStripe(deps: ReconcileDeps, counters: Counters, start: PaymentView): Promise<Look> {
  const now = deps.now()
  const issues: Issue[] = []
  let view = start
  const stripe = deps.stripe
  if (stripe && !scopeOf(view, null)?.lines.some(l => l.source === 'stripe_bt')) view = await readBill({ ...deps, stripe }, counters, view)
  const charge = scopeOf(view, null)
  const days = ageDays(now, view.created_at)
  if (!isFinal(charge) && days >= STRIPE_WINDOW_DAYS) {
    issues.push(unreconciledIssue(view, 'unreconciled', charge?.lines.find(l => l.status === 'estimated')?.kind ?? null, days))
  }
  return { next: new Date(now.getTime() + RECHECK_MS), error: null, issues }
}
