import 'server-only'

import { z } from 'zod'

import { captureError } from '../../analytics/capture-error'
import { logger } from '../../logger'
import { callRpc, type RpcClient } from '../rpc'

// F3 (ARCHITECTURE §6.2 联盟返佣 · 订单手续费): the webhook side of the fee ledger. When a payment
// settles, its fee lines go through payment_fee_record (1703) — the only writer, idempotent by
// key, a no-op before payment_fee_settings.record_from — and never touch the payment itself:
// every step here runs after the payment is recorded, and any failure is logged (ids only, no
// buyer data) and left for the daily reconciliation (F4) to fill in.

export type FeeKind = 'acquiring' | 'intl_card' | 'fx' | 'mp' | 'billing' | 'radar' | 'refund_fee'
export type FeeSource = 'estimate' | 'stripe_bt' | 'formula'

export type FeeLine = {
  kind: FeeKind
  source: FeeSource
  schedule_id?: number
  // Omitted: priced from the schedule (or, on a real-bill line, split from actual_cents).
  amount_cents?: number
  source_ref?: string
  note?: string
}

export type FeeWrite = {
  payment_id: number
  idempotency_key: string
  refund_id?: string
  basis_cents: number
  actual_cents?: number
  lines: FeeLine[]
}

const schedule = z.object({ id: z.number().int(), rate_bp: z.number().int(), fixed_cents: z.number().int() })
export type FeeSchedule = z.infer<typeof schedule>

const targetSchema = z
  .object({
    payment_id: z.number().int(),
    channel: z.enum(['stripe', 'waffo']),
    method: z.string(),
    currency: z.string(),
    amount_total: z.number().int(),
    recordable: z.boolean(),
    schedules: z.record(z.string(), schedule),
  })
  .nullable()
export type FeeTarget = NonNullable<z.infer<typeof targetSchema>>

const recordSchema = z.object({
  applied: z.boolean(),
  reason: z.string().optional(),
  revision: z.number().int().optional(),
  fee_cents: z.number().int().nullable().optional(),
  fee_status: z.string().nullable().optional(),
})
export type FeeRecordResult = z.infer<typeof recordSchema>

// The payments row and the rates in force when it was created (1720), or why nothing is to be
// written: 'skipped' (no such row), 'legacy' (before record_from, or record_from unset — then
// nothing past this one read runs, so the webhook does exactly what it did before F3).
export async function feeTarget(db: RpcClient, at: { paymentId: number } | { ref: string }): Promise<FeeTarget | 'skipped' | 'legacy'> {
  const target = await callRpc(db, 'payment_fee_target', {
    p_payment_id: 'paymentId' in at ? at.paymentId : null,
    p_ref: 'ref' in at ? at.ref : null,
  }, targetSchema)
  if (!target) return 'skipped'
  return target.recordable ? target : 'legacy'
}

export function writeFees(db: RpcClient, input: FeeWrite): Promise<FeeRecordResult> {
  return callRpc(db, 'payment_fee_record', { p_input: input }, recordSchema)
}

// The published rate line for `kind`, or nothing when that kind has no rate for this method.
export function priced(target: FeeTarget, kind: FeeKind, source: FeeSource, extra: Partial<FeeLine> = {}): FeeLine | null {
  const rate = target.schedules[kind]
  return rate ? { kind, source, schedule_id: rate.id, ...extra } : null
}

export type FeeOutcome = 'recorded' | 'replayed' | 'final' | 'legacy' | 'skipped' | 'failed'

export function outcomeOf(result: FeeRecordResult): FeeOutcome {
  if (result.applied) return 'recorded'
  return result.reason === 'replayed' || result.reason === 'final' || result.reason === 'legacy' ? result.reason : 'skipped'
}

// Runs one fee step and never throws: the payment is already recorded and granted, and a fee
// that could not be written is the daily reconciliation's to fill in. `fields` carry provider
// ids only (session / invoice / charge / PAY_ / refund), never the buyer.
export async function safely(fields: Record<string, string | number | null>, step: () => Promise<FeeOutcome>): Promise<FeeOutcome> {
  try {
    const outcome = await step()
    if (outcome === 'recorded') logger.info('payment fees recorded', fields)
    return outcome
  } catch (error) {
    logger.error('payment fees not recorded', { ...fields, error })
    captureError(error, { fields: { ...fields, stage: 'payment_fees' } })
    return 'failed'
  }
}
