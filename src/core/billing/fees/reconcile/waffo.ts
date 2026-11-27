import 'server-only'

import { AppError } from '../../../errors'
import type { FeeTarget, FeeWrite } from '../record'
import { waffoChargeWrite, waffoRefundWrite } from '../waffo'
import type { WaffoSettlement } from '../waffo-settlement'
import {
  ageDays, DAY, HOUR, isFinal, mismatchIssue, scopeOf, targetOf, unreconciledIssue, writeFresh,
  type Counters, type Issue, type Look, type PaymentView, type ReconcileDeps,
} from './view'

// F4, Waffo (F1 §3): a payment's (or refund's) real fee is settlementInfo.feeAmount, there only
// once Waffo has settled it, 9.6–10.1 days later. Until then the estimate stands (written here
// too when the webhook wrote nothing). Settled → one `waffo_settlement` revision, final.

export const WAFFO_FIRST_LOOK_DAYS = 9
export const WAFFO_REFUND_FIRST_LOOK_DAYS = 8
export const WAFFO_WINDOW_DAYS = 14
const RECHECK_MS = 12 * HOUR

// One scope to settle: the charge (refundId null) or one refund.
type Item = {
  refundId: string | null
  ref: string
  happenedAt: string
  basis: number
  kind: 'acquiring' | 'refund_fee'
  firstLookDays: number
  read: () => Promise<WaffoSettlement | null>
  estimate: (target: FeeTarget) => FeeWrite | null
}

type Step = { view: PaymentView; issue: Issue | null; wake: number | null }

function finalWrite(view: PaymentView, item: Item, fee: number, target: FeeTarget | null) {
  const schedule = target?.schedules[item.kind]
  return {
    payment_id: view.payment_id,
    idempotency_key: `waffo_settlement:${item.ref}`,
    ...(item.refundId !== null && { refund_id: item.refundId }),
    basis_cents: item.basis,
    actual_cents: fee,
    expected_revision: scopeOf(view, item.refundId)?.revision ?? 0,
    lines: [{ kind: item.kind, source: 'waffo_settlement' as const, source_ref: item.ref, ...(schedule && { schedule_id: schedule.id }) }],
  }
}

async function settledStep(deps: ReconcileDeps, counters: Counters, view: PaymentView, item: Item, settled: WaffoSettlement): Promise<Step> {
  if (settled.currency !== 'usd') throw new AppError('INTERNAL', 'Waffo fee not in USD')
  const key = item.refundId === null ? 'charge' : item.refundId
  const issue = mismatchIssue(view, scopeOf(view, item.refundId), settled.feeCents, item.kind, `mismatch:${key}`)
  const target = await targetOf(deps, view.payment_id)
  const written = await writeFresh(deps, counters, view, (v) => finalWrite(v, item, settled.feeCents, target))
  return { view: written.view, issue, wake: null }
}

// Not settled yet. The webhook wrote nothing (it failed): the estimate, so the commission has a
// figure meanwhile. Past the window, the Owner is told.
async function waitingStep(deps: ReconcileDeps, counters: Counters, view: PaymentView, item: Item, firstLook: number): Promise<Step> {
  const now = deps.now().getTime()
  let current = view
  if (!scopeOf(current, item.refundId)) {
    const target = await targetOf(deps, view.payment_id)
    const write = target ? item.estimate(target) : null
    if (write) current = (await writeFresh(deps, counters, current, () => ({ ...write, expected_revision: 0 }))).view
  }
  const days = ageDays(deps.now(), item.happenedAt)
  const key = item.refundId === null ? 'unreconciled' : `unreconciled:${item.refundId}`
  const issue = days >= WAFFO_WINDOW_DAYS ? unreconciledIssue(current, key, item.kind, days) : null
  return { view: current, issue, wake: firstLook > now ? firstLook : now + RECHECK_MS }
}

async function settleItem(deps: ReconcileDeps, counters: Counters, view: PaymentView, item: Item): Promise<Step> {
  const firstLook = Date.parse(item.happenedAt) + item.firstLookDays * DAY
  const settled = deps.waffo && deps.now().getTime() >= firstLook ? await item.read() : null
  return settled ? settledStep(deps, counters, view, item, settled) : waitingStep(deps, counters, view, item, firstLook)
}

function itemsOf(deps: ReconcileDeps, view: PaymentView, paymentRef: string): Item[] {
  const waffo = deps.waffo
  const charge: Item = {
    refundId: null, ref: paymentRef, happenedAt: view.created_at, basis: view.amount_total, kind: 'acquiring',
    firstLookDays: WAFFO_FIRST_LOOK_DAYS, read: async () => (waffo ? waffo.payment(paymentRef) : null), estimate: (t) => waffoChargeWrite(t, paymentRef),
  }
  // payment_refunds keys a Waffo refund by its refund.succeeded event id, which is the REF_ id.
  const refunds = view.refunds.filter(r => r.refund_ref.startsWith('REF_')).map((r): Item => ({
    refundId: r.refund_ref, ref: r.refund_ref, happenedAt: r.created_at, basis: r.amount, kind: 'refund_fee',
    firstLookDays: WAFFO_REFUND_FIRST_LOOK_DAYS, read: async () => (waffo ? waffo.refund(r.refund_ref) : null),
    estimate: (t) => waffoRefundWrite(t, r.refund_ref, r.amount),
  }))
  return [charge, ...refunds]
}

export async function lookWaffo(deps: ReconcileDeps, counters: Counters, start: PaymentView): Promise<Look> {
  const now = deps.now().getTime()
  const paymentRef = start.waffo_payment_id
  if (!paymentRef) return { next: new Date(now + DAY), error: 'no waffo payment id', issues: [] }
  const issues: Issue[] = []
  let view = start
  let next = Number.POSITIVE_INFINITY
  for (const item of itemsOf(deps, view, paymentRef)) {
    if (isFinal(scopeOf(view, item.refundId))) continue
    const step = await settleItem(deps, counters, view, item)
    view = step.view
    if (step.issue) issues.push(step.issue)
    if (step.wake !== null) next = Math.min(next, step.wake)
  }
  return { next: new Date(Number.isFinite(next) ? next : now + DAY), error: null, issues }
}
