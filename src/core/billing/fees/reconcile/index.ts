import 'server-only'

import { createHash } from 'node:crypto'

import { z } from 'zod'

import { logger } from '../../../logger'
import { callRpc } from '../../rpc'
import { recordBatches, writeShares } from './batches-run'
import { lookStripe, STRIPE_WINDOW_DAYS } from './stripe'
import {
  ageDays, codeOf, HOUR, unreconciledIssue, viewSchema, type Issue, type Look, type PaymentView, type ReconcileDeps, type ReconcileSummary,
} from './view'
import { lookWaffo, WAFFO_WINDOW_DAYS } from './waffo'

// F4 (ARCHITECTURE §6.2 联盟返佣 · 订单手续费 · 对账): the job behind /api/cron/payment-fees, hourly.
// The webhooks (F3) write each payment's fees when it settles, mostly estimates; this turns them
// into the providers' final figures:
//   * Waffo (waffo.ts): settlementInfo.feeAmount once the payment or refund has settled.
//   * Stripe (stripe.ts): the charge's bill read again when the webhook could not write it; then
//     the unattributed batches (batches-run.ts) shared to the day's payments.
// Every write is payment_fee_record with the revision it was built from, rebuilt on a conflict
// with the webhook. Nothing here touches a payment's status or holds a commission: what stays
// unreconciled past its window is told to the Owner once, and F5 confirms on the estimate after
// its grace. Inert while payment_fee_settings.record_from is unset (the first read says so).

export type { ReconcileDeps, ReconcileStripe, ReconcileSummary } from './view'

const dueSchema = z.object({ live: z.boolean(), payments: z.array(viewSchema) })

const MAX_BACKOFF_MS = 24 * HOUR

// A look that failed (the provider errored, a fee came back unusable, a reference is missing):
// retried after 1, 2, 4 … hours (at most a day), and past the channel's window the Owner is told
// it is not reconciled, exactly as when the provider simply has no figure yet.
function failedLook(deps: ReconcileDeps, view: PaymentView, error: string, issues: Issue[]): Look {
  const now = deps.now()
  const wait = Math.min(MAX_BACKOFF_MS, HOUR * 2 ** Math.min(view.attempts, 5))
  const days = ageDays(now, view.created_at)
  const window = view.channel === 'waffo' ? WAFFO_WINDOW_DAYS : STRIPE_WINDOW_DAYS
  const late = days >= window && !issues.some(i => i.key === 'unreconciled')
  return { next: new Date(now.getTime() + wait), error, issues: late ? [...issues, unreconciledIssue(view, 'unreconciled', null, days)] : issues }
}

async function look(deps: ReconcileDeps, summary: ReconcileSummary, view: PaymentView): Promise<Look> {
  try {
    const result = view.channel === 'waffo' ? await lookWaffo(deps, summary, view) : await lookStripe(deps, summary, view)
    return result.error ? failedLook(deps, view, result.error, result.issues) : result
  } catch (error) {
    summary.failed += 1
    logger.warn('payment fees not reconciled', { channel: view.channel, payment_row: view.payment_id, error: codeOf(error) })
    return failedLook(deps, view, codeOf(error), [])
  }
}

// Records the look; keeps the issues whose key this payment had not been alerted for.
async function mark(deps: ReconcileDeps, paymentId: number, result: Look): Promise<Issue[]> {
  const fresh = await callRpc(deps.db, 'payment_fee_reconcile_mark', {
    p_payment_id: paymentId, p_next: result.next.toISOString(), p_error: result.error, p_alerts: result.issues.map(i => i.key),
  }, z.array(z.string()))
  return result.issues.filter(i => fresh.includes(i.key))
}

async function stripeBatches(deps: ReconcileDeps, summary: ReconcileSummary, deadline: number): Promise<Issue[]> {
  const issues: Issue[] = []
  if (deps.stripe && Date.now() <= deadline) {
    try {
      const run = await recordBatches(deps, deps.stripe)
      summary.batches = run.batches
      issues.push(...run.issues)
    } catch (error) {
      summary.failed += 1
      logger.warn('payment fee batches not read', { error: codeOf(error) })
    }
  }
  // A share's mismatch is remembered on its payment like the rest; the payment's next look stays.
  for (const issue of await writeShares(deps, summary, deadline)) {
    const remembered = await mark(deps, Number(issue.ref), { next: deps.now(), error: null, issues: [issue] }).catch(() => [])
    issues.push(...remembered)
  }
  return issues
}

async function tell(deps: ReconcileDeps, issues: Issue[]): Promise<void> {
  const fingerprint = createHash('sha256').update(issues.map(i => `${i.ref}:${i.key}`).sort().join('|')).digest('hex').slice(0, 16)
  await deps.alert({
    kind: 'payment_fee_reconcile', fingerprint,
    issues: issues.map(i => ({ issue: i.issue, channel: i.channel, ref: i.ref, fee: i.fee, estimateCents: i.estimateCents, actualCents: i.actualCents, days: i.days })),
  })
}

export async function runPaymentFeeReconcile(deps: ReconcileDeps): Promise<ReconcileSummary> {
  const deadline = Date.now() + (deps.budgetMs ?? 90_000)
  const summary: ReconcileSummary = { live: false, looked: 0, written: 0, conflicts: 0, failed: 0, batches: 0, shares: 0, alerts: 0 }
  const due = await callRpc(deps.db, 'payment_fee_reconcile_due', { p_now: deps.now().toISOString(), p_limit: deps.limit ?? 40 }, dueSchema)
  if (!due.live) return summary
  summary.live = true
  const issues: Issue[] = []
  for (const view of due.payments) {
    if (Date.now() > deadline) break
    summary.looked += 1
    issues.push(...(await mark(deps, view.payment_id, await look(deps, summary, view))))
  }
  issues.push(...(await stripeBatches(deps, summary, deadline)))
  if (issues.length > 0) {
    await tell(deps, issues)
    summary.alerts = issues.length
  }
  return summary
}
