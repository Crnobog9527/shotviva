import 'server-only'

import type Stripe from 'stripe'
import { z } from 'zod'

import type { FeeReconcileIssue, OwnerAlert } from '../../../alerts'
import { AppError } from '../../../errors'
import { callRpc, type RpcClient } from '../../rpc'
import type { StripeApi } from '../../stripe/client'
import { feeTarget, type FeeTarget, type FeeWrite } from '../record'
import type { WaffoSettlementApi } from '../waffo-settlement'

// F4: what the reconciliation reads about a payment (1780 _payment_fee_reconcile_view), and the
// one way it writes: payment_fee_record with the revision the set was built from, rebuilt from a
// fresh read when another writer (the webhook, F3) got in first.

export const HOUR = 3_600_000
export const DAY = 24 * HOUR
const CONFLICT_RETRIES = 3

const lineSchema = z.object({
  kind: z.string(),
  source: z.enum(['estimate', 'stripe_bt', 'waffo_settlement', 'formula']),
  status: z.enum(['estimated', 'final']),
  amount_cents: z.number().int(),
  schedule_id: z.number().int().nullable(),
  source_ref: z.string().nullable(),
  note: z.string().nullable(),
})
export type Line = z.infer<typeof lineSchema>
const scopeSchema = z.object({ refund_id: z.string().nullable(), revision: z.number().int(), lines: z.array(lineSchema) })
export type Scope = z.infer<typeof scopeSchema>
export const viewSchema = z.object({
  payment_id: z.number().int(),
  channel: z.enum(['stripe', 'waffo']),
  method: z.string(),
  currency: z.string(),
  product_id: z.string(),
  amount_total: z.number().int(),
  created_at: z.string(),
  fee_status: z.string().nullable(),
  stripe_session_id: z.string().nullable(),
  stripe_invoice_id: z.string().nullable(),
  stripe_charge_id: z.string().nullable(),
  waffo_payment_id: z.string().nullable(),
  scopes: z.array(scopeSchema),
  refunds: z.array(z.object({ refund_ref: z.string(), amount: z.number().int(), created_at: z.string() })),
  alerted: z.array(z.string()),
})
export type PaymentView = z.infer<typeof viewSchema>
const recordSchema = z.object({ applied: z.boolean(), reason: z.string().optional(), revision: z.number().int().optional() })
export type RecordResult = z.infer<typeof recordSchema>

export type ReconcileStripe = Pick<StripeApi, 'charges' | 'invoices'> & {
  checkout: { sessions: Pick<StripeApi['checkout']['sessions'], 'retrieve'> }
  balanceTransactions: Pick<Stripe['balanceTransactions'], 'list'>
}

export type ReconcileDeps = {
  db: RpcClient
  // null: that channel is not configured here; its payments wait (and alert past the window).
  stripe: ReconcileStripe | null
  waffo: WaffoSettlementApi | null
  alert: (alert: OwnerAlert) => Promise<void>
  now: () => Date
  // Payments looked at per run, and the time after which the run starts no new work.
  limit?: number
  budgetMs?: number
}

export type ReconcileSummary = {
  live: boolean
  looked: number
  written: number
  conflicts: number
  failed: number
  batches: number
  shares: number
  alerts: number
}

// An Owner alert item with the key the job remembers it by (each key is sent once per payment).
export type Issue = FeeReconcileIssue & { key: string }
// The outcome of one look at a payment: when to look again, the error, what to tell the Owner.
export type Look = { next: Date; error: string | null; issues: Issue[] }

// A line as payment_fee_record takes it (a real-bill line without an amount takes the residual).
export type InputLine = {
  kind: string
  source: Line['source']
  status?: Line['status']
  schedule_id?: number
  amount_cents?: number
  source_ref?: string
  note?: string
}
export type Write = Omit<FeeWrite, 'lines'> & { lines: InputLine[]; expected_revision?: number }

export const scopeOf = (view: PaymentView, refundId: string | null) => view.scopes.find(s => s.refund_id === refundId) ?? null
export const isFinal = (scope: Scope | null) => scope !== null && scope.lines.every(l => l.status === 'final')
export const totalOf = (scope: Scope | null) => scope?.lines.reduce((sum, l) => sum + l.amount_cents, 0) ?? 0
export const ageDays = (now: Date, iso: string) => Math.floor((now.getTime() - Date.parse(iso)) / DAY)
export const isRealBill = (line: Pick<Line, 'source'>) => line.source === 'stripe_bt' || line.source === 'waffo_settlement'

// Real fee vs estimate: told to the Owner when they differ by more than 2¢ and 2% of the estimate.
export function feeDiffers(estimate: number, actual: number): boolean {
  return Math.abs(actual - estimate) > Math.max(2, Math.ceil(estimate * 0.02))
}

// A current line, carried into a new revision unchanged.
export function carried(line: Line): InputLine {
  const out: InputLine = { kind: line.kind, source: line.source, status: line.status, amount_cents: line.amount_cents }
  if (line.schedule_id !== null) out.schedule_id = line.schedule_id
  if (line.source_ref !== null) out.source_ref = line.source_ref
  if (line.note !== null) out.note = line.note
  return out
}

function sqlMessage(error: unknown): string | undefined {
  return error instanceof AppError ? (error.cause as { message?: string } | undefined)?.message : undefined
}

// Ids and codes only, for logs and the state row.
export function codeOf(error: unknown): string {
  if (error instanceof AppError) return (sqlMessage(error) ?? error.code).slice(0, 120)
  return error instanceof Error ? error.name : 'error'
}

export function reread(deps: ReconcileDeps, paymentId: number): Promise<PaymentView> {
  return callRpc(deps.db, 'payment_fee_reconcile_payment', { p_payment_id: paymentId }, viewSchema)
}

export async function targetOf(deps: ReconcileDeps, paymentId: number): Promise<FeeTarget | null> {
  const target = await feeTarget(deps.db, { paymentId })
  return typeof target === 'string' ? null : target
}

export type Counters = Pick<ReconcileSummary, 'written' | 'conflicts'>

// Builds a set from the payment as it is now and writes it with that revision; on
// PAYMENT_FEE_REVISION_CONFLICT reads the payment again and rebuilds (the newer lines are then
// what the set is built from). `build` returning null means nothing (more) to write.
export async function writeFresh(
  deps: ReconcileDeps,
  counters: Counters,
  view: PaymentView,
  build: (view: PaymentView) => Write | null,
): Promise<{ result: RecordResult | null; view: PaymentView }> {
  let current = view
  for (let attempt = 0; ; attempt += 1) {
    const input = build(current)
    if (!input) return { result: null, view: current }
    try {
      const result = await callRpc(deps.db, 'payment_fee_record', { p_input: input }, recordSchema)
      if (result.applied) counters.written += 1
      return { result, view: await reread(deps, current.payment_id) }
    } catch (error) {
      if (sqlMessage(error) !== 'PAYMENT_FEE_REVISION_CONFLICT' || attempt >= CONFLICT_RETRIES) throw error
      counters.conflicts += 1
      current = await reread(deps, current.payment_id)
    }
  }
}

export function mismatchIssue(view: PaymentView, before: Scope | null, actual: number, fee: string, key: string): Issue | null {
  if (!before || isFinal(before)) return null
  const estimate = totalOf(before)
  if (!feeDiffers(estimate, actual)) return null
  return { key, issue: 'mismatch', channel: view.channel, ref: String(view.payment_id), fee, estimateCents: estimate, actualCents: actual, days: null }
}

export function unreconciledIssue(view: PaymentView, key: string, fee: string | null, days: number): Issue {
  return { key, issue: 'unreconciled', channel: view.channel, ref: String(view.payment_id), fee, estimateCents: null, actualCents: null, days }
}
