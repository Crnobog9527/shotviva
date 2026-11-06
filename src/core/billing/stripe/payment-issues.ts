import 'server-only'

import { z } from 'zod'

import { captureAlert, type AlertKind } from '../../analytics/capture-error'
import { logger } from '../../logger'
import { callRpc } from '../rpc'
import type { FulfilDeps } from './fulfil'

// charge.refunded and charge.dispute.created (ARCHITECTURE §6.2, §6.3): record on the payment
// and alert the Owner in Sentry. Credits are never clawed back: Link support can refund without
// us, and the Owner decides by hand (admin_adjust_credits). Amounts are re-read from Stripe.

export type IssueOutcome = 'recorded' | 'unknown_charge'

const issueSchema = z
  .object({
    user_id: z.uuid(),
    product_id: z.string(),
    status: z.string(),
    amount_total: z.number().int(),
    amount_refunded: z.number().int(),
    currency: z.string(),
  })
  .nullable()

type Issue = { kind: 'refunded' | 'disputed'; chargeId: string; amountRefunded: number | null; sourceId: string }

const ALERT: Record<Issue['kind'], AlertKind> = { refunded: 'charge_refunded', disputed: 'charge_disputed' }

type Payment = z.infer<typeof issueSchema>

// Ids and amounts only (no email), for the log line and the Sentry alert.
function alertFields(issue: Issue, payment: Payment): Record<string, string | number | boolean | null> {
  if (!payment) {
    return { charge_id: issue.chargeId, source_id: issue.sourceId, known_payment: false, amount_refunded: issue.amountRefunded }
  }
  return {
    charge_id: issue.chargeId,
    source_id: issue.sourceId,
    known_payment: true,
    user_id: payment.user_id,
    product_id: payment.product_id,
    status: payment.status,
    amount_refunded: payment.amount_refunded,
    amount_total: payment.amount_total,
    currency: payment.currency,
  }
}

async function record(deps: FulfilDeps, issue: Issue): Promise<IssueOutcome> {
  const payment = await callRpc(
    deps.db,
    'record_payment_issue',
    { p_charge_id: issue.chargeId, p_kind: issue.kind, p_amount_refunded: issue.amountRefunded },
    issueSchema,
  )
  const fields = alertFields(issue, payment)
  logger.warn(`stripe charge ${issue.kind} recorded`, fields)
  // The Owner reviews every one, recorded or not: credits were not taken back.
  captureAlert(ALERT[issue.kind], `Stripe charge ${issue.chargeId} ${issue.kind}: credits not clawed back`, { fields })
  return payment ? 'recorded' : 'unknown_charge'
}

export async function recordRefund(deps: FulfilDeps, chargeId: string): Promise<IssueOutcome> {
  const charge = await deps.stripe.charges.retrieve(chargeId)
  return record(deps, { kind: 'refunded', chargeId: charge.id, amountRefunded: charge.amount_refunded, sourceId: charge.id })
}

export async function recordDispute(deps: FulfilDeps, disputeId: string): Promise<IssueOutcome> {
  const dispute = await deps.stripe.disputes.retrieve(disputeId)
  const chargeId = typeof dispute.charge === 'string' ? dispute.charge : dispute.charge.id
  return record(deps, { kind: 'disputed', chargeId, amountRefunded: null, sourceId: dispute.id })
}
