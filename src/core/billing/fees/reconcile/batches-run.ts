import 'server-only'

import type Stripe from 'stripe'
import { z } from 'zod'

import { logger } from '../../../logger'
import { callRpc } from '../../rpc'
import { batchDay, classifyStripeFee, matchBatch, type BatchKind } from '../batches'
import type { FeeTarget } from '../record'
import {
  carried, codeOf, DAY, feeDiffers, isRealBill, scopeOf, targetOf, viewSchema, writeFresh,
  type InputLine, type Issue, type PaymentView, type ReconcileDeps, type ReconcileStripe, type ReconcileSummary, type Write,
} from './view'

// F4, Stripe batches (F1 §2.2): each `stripe_fee` balance transaction of the last ten days is
// recorded once (1780 payment_fee_stripe_batch_record) — allocated to that day's payments when
// its amount explains a set of them (batches.ts), a mismatch (told to the Owner) when nothing
// does, ignored when it is no per-order fee. The shares are then written into each payment's
// fees as final formula lines, in a step of their own that also repairs a share a later write
// undid.

const LOOKBACK_DAYS = 10
const PAGES = 5
// A batch nothing explains may only be missing a payment whose webhook is late: wait a day.
const MISMATCH_AFTER_MS = DAY

const candidatesSchema = z.array(z.object({ payment_id: z.number().int(), created_at: z.string(), amount_total: z.number().int(), currency: z.string() }))
const pendingSchema = z.array(z.object({ txn_id: z.string(), kind: z.enum(['mp', 'billing', 'radar']), share_cents: z.number().int(), payment: viewSchema }))
type Pending = z.infer<typeof pendingSchema>[number]

async function listFeeEntries(stripe: ReconcileStripe, since: Date): Promise<Stripe.BalanceTransaction[]> {
  const all: Stripe.BalanceTransaction[] = []
  let after: string | undefined
  for (let page = 0; page < PAGES; page += 1) {
    const list = await stripe.balanceTransactions.list({
      type: 'stripe_fee', created: { gte: Math.floor(since.getTime() / 1000) }, limit: 100, ...(after && { starting_after: after }),
    })
    all.push(...list.data)
    if (!list.has_more || list.data.length === 0) break
    after = list.data[list.data.length - 1].id
  }
  return all.filter(t => /^txn_[A-Za-z0-9]+$/.test(t.id)).sort((a, b) => a.created - b.created || a.id.localeCompare(b.id))
}

type Planned = { input: Record<string, unknown>; issue: Issue | null } | null

function issueFor(txn: Stripe.BalanceTransaction, issue: 'batch_mismatch' | 'batch_unknown', fee: string | null, formula: number | null): Issue {
  return { key: `batch:${txn.id}`, issue, channel: 'stripe', ref: txn.id, fee, estimateCents: formula, actualCents: Math.abs(txn.amount), days: null }
}

// What to record for one entry, or null to leave it for a later run.
async function plan(deps: ReconcileDeps, txn: Stripe.BalanceTransaction): Promise<Planned> {
  const booked = new Date(txn.created * 1000)
  const base = { txn_id: txn.id, booked_at: booked.toISOString(), label_date: batchDay(txn.description, booked), description: txn.description ?? null }
  const amount = -txn.amount
  const { kind, known } = classifyStripeFee(txn.description)
  if (kind === 'other' || amount < 0) {
    const input = { ...base, kind, amount_cents: Math.abs(amount), status: 'ignored', note: amount < 0 ? 'credit' : null }
    return { input, issue: known && amount >= 0 ? null : issueFor(txn, 'batch_unknown', null, null) }
  }
  const candidates = await callRpc(deps.db, 'payment_fee_stripe_batch_candidates',
    { p_kind: kind, p_day: base.label_date, p_before: base.booked_at }, candidatesSchema)
  const match = matchBatch(kind, amount, candidates.map(c => ({
    payment_id: c.payment_id,
    basis_cents: c.currency === 'usd' ? c.amount_total : null,
    onDay: new Date(c.created_at).toISOString().slice(0, 10) === base.label_date,
  })))
  if (match.status === 'allocated') {
    return { input: { ...base, kind, amount_cents: amount, status: 'allocated', formula_cents: match.formula_cents, note: match.note, items: match.items }, issue: null }
  }
  if (deps.now().getTime() - booked.getTime() < MISMATCH_AFTER_MS) return null
  const input = { ...base, kind, amount_cents: amount, status: 'mismatch', formula_cents: match.formula_cents, note: match.note }
  return { input, issue: issueFor(txn, 'batch_mismatch', kind, match.formula_cents) }
}

export async function recordBatches(deps: ReconcileDeps, stripe: ReconcileStripe): Promise<{ batches: number; issues: Issue[] }> {
  const issues: Issue[] = []
  const txns = await listFeeEntries(stripe, new Date(deps.now().getTime() - LOOKBACK_DAYS * DAY))
  if (txns.length === 0) return { batches: 0, issues }
  const known = new Set(await callRpc(deps.db, 'payment_fee_stripe_batches_known', { p_ids: txns.map(t => t.id) }, z.array(z.string())))
  let batches = 0
  for (const txn of txns.filter(t => !known.has(t.id))) {
    try {
      const planned = await plan(deps, txn)
      if (!planned) continue
      const recorded = await callRpc(deps.db, 'payment_fee_stripe_batch_record', { p_input: planned.input }, z.object({ applied: z.boolean() }))
      if (!recorded.applied) continue
      batches += 1
      if (planned.issue) issues.push(planned.issue)
    } catch (error) {
      // e.g. PAYMENT_FEE_BATCH_TAKEN: another run took one of these payments first; seen next run.
      logger.warn('payment fee batch not recorded', { txn: txn.id, error: codeOf(error) })
    }
  }
  return { batches, issues }
}

// The payment's current set with this batch's share as the final line of its kind, every other
// line carried over as it is; null when there is nothing to carry yet (the bill comes first) or
// the share is already there.
export function shareWrite(view: PaymentView, item: { txn_id: string; kind: BatchKind; share_cents: number }, target: FeeTarget | null): Write | null {
  const scope = scopeOf(view, null)
  if (!scope || scope.lines.some(l => l.kind === item.kind && l.status === 'final' && l.source_ref === item.txn_id)) return null
  const old = scope.lines.find(l => l.kind === item.kind)
  const share = shareLine(item, old?.schedule_id ?? target?.schedules[item.kind]?.id ?? null)
  const lines = scope.lines.map(l => (l.kind === item.kind ? share : carried(l)))
  if (!old) lines.push(share)
  const real = scope.lines.filter(isRealBill)
  return {
    payment_id: view.payment_id,
    idempotency_key: `${item.kind}_batch:${item.txn_id}:${view.payment_id}:r${scope.revision}`,
    basis_cents: view.amount_total,
    ...(real.length > 0 && { actual_cents: real.reduce((sum, l) => sum + l.amount_cents, 0) }),
    expected_revision: scope.revision,
    lines,
  }
}

function shareLine(item: { txn_id: string; kind: BatchKind; share_cents: number }, scheduleId: number | null): InputLine {
  const share: InputLine = { kind: item.kind, source: 'formula', status: 'final', amount_cents: item.share_cents, source_ref: item.txn_id, note: 'Stripe batch share' }
  if (scheduleId !== null) share.schedule_id = scheduleId
  return share
}

async function writeShare(deps: ReconcileDeps, counters: ReconcileSummary, item: Pending): Promise<Issue | null> {
  const view = item.payment
  const before = scopeOf(view, null)?.lines.find(l => l.kind === item.kind) ?? null
  const target = before?.schedule_id ? null : await targetOf(deps, view.payment_id)
  const { result } = await writeFresh(deps, counters, view, (v) => shareWrite(v, item, target))
  if (!result?.applied) return null
  counters.shares += 1
  if (!before || before.status !== 'estimated' || !feeDiffers(before.amount_cents, item.share_cents)) return null
  return { key: `mismatch:${item.kind}`, issue: 'mismatch', channel: 'stripe', ref: String(view.payment_id), fee: item.kind,
    estimateCents: before.amount_cents, actualCents: item.share_cents, days: null }
}

export async function writeShares(deps: ReconcileDeps, counters: ReconcileSummary, deadline: number): Promise<Issue[]> {
  const issues: Issue[] = []
  const pending = await callRpc(deps.db, 'payment_fee_stripe_batch_pending', { p_limit: 100 }, pendingSchema)
  for (const item of pending) {
    if (Date.now() > deadline) break
    try {
      const issue = await writeShare(deps, counters, item)
      if (issue) issues.push(issue)
    } catch (error) {
      counters.failed += 1
      logger.warn('payment fee batch share not written', { txn: item.txn_id, payment_row: item.payment.payment_id, error: codeOf(error) })
    }
  }
  return issues
}
