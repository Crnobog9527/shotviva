import 'server-only'

import { z } from 'zod'

import { notifyOwner, type Clawback, type DisputeOpenedAlert, type OwnerAlert } from '../../alerts'
import { captureAlert, type AlertKind } from '../../analytics/capture-error'
import { logger } from '../../logger'
import { callRpc } from '../rpc'
import { openDispute } from './disputes/open'
import type { FulfilDeps } from './fulfil'
import { cancelRefundedMembership } from './refund-subscription'

// charge.refunded and charge.dispute.created (ARCHITECTURE §6.2 「退款自动扣回积分」, §6.3), with
// amounts re-read from Stripe. record_payment_issue records the refund, takes the payment's
// credits back (granted × refunded share, capped at the paid balance, the rest written off as a
// shortfall) and ends a refunded membership, in one transaction; this side then cancels that
// membership's subscription and tells the Owner what was taken back (Sentry, and Feishu, T72).
// A dispute is recorded here; open_payment_dispute (T82's dispute flow) takes everything back and
// sends the one alert.

export type IssueOutcome = 'recorded' | 'unknown_charge'

const issueSchema = z
  .object({
    payment_id: z.number().int().optional(),
    user_id: z.uuid(),
    product_id: z.string(),
    status: z.string(),
    amount_total: z.number().int(),
    amount_refunded: z.number().int(),
    currency: z.string(),
    // T71's clawback totals on the payment row (refunds only; a dispute's come from open_payment_dispute).
    credits_clawed_back: z.number().int().optional(),
    clawback_shortfall: z.number().int().optional(),
    membership_ended: z.boolean().optional(),
    stripe_session_id: z.string().nullable().optional(),
    stripe_invoice_id: z.string().nullable().optional(),
  })
  .nullable()

type Issue = { kind: 'refunded' | 'disputed'; chargeId: string; amountRefunded: number | null; sourceId: string }

const ALERT: Record<Issue['kind'], AlertKind> = { refunded: 'charge_refunded', disputed: 'charge_disputed' }

export type IssuePayment = z.infer<typeof issueSchema>

// Ids and amounts only (no email), for the log line and the Sentry alert.
function alertFields(issue: Issue, payment: IssuePayment): Record<string, string | number | boolean | null> {
  if (!payment) {
    return { charge_id: issue.chargeId, source_id: issue.sourceId, known_payment: false, amount_refunded: issue.amountRefunded }
  }
  return {
    charge_id: issue.chargeId,
    source_id: issue.sourceId,
    known_payment: true,
    payment_id: payment.payment_id ?? null,
    user_id: payment.user_id,
    product_id: payment.product_id,
    status: payment.status,
    amount_refunded: payment.amount_refunded,
    amount_total: payment.amount_total,
    currency: payment.currency,
    credits_clawed_back: payment.credits_clawed_back ?? null,
    clawback_shortfall: payment.clawback_shortfall ?? null,
    membership_ended: payment.membership_ended ?? null,
  }
}

export function clawbackOf(row: { credits_clawed_back?: number; clawback_shortfall?: number } | null): Clawback | null {
  if (row?.credits_clawed_back === undefined) return null
  return { clawedBack: row.credits_clawed_back, shortfall: row.clawback_shortfall ?? 0 }
}

function ownerAlert(issue: Issue, payment: IssuePayment): OwnerAlert {
  const facts = payment
    ? { userId: payment.user_id, productId: payment.product_id, amount: { cents: payment.amount_total, currency: payment.currency }, credits: clawbackOf(payment) }
    : { userId: null, productId: null, amount: null, credits: null }
  if (issue.kind === 'disputed') return { kind: 'dispute_opened', disputeId: issue.sourceId, ...facts }
  const refunded = payment ? { cents: payment.amount_refunded, currency: payment.currency } : null
  return { kind: 'refund', channel: 'stripe', refundId: issue.chargeId, refunded, ...facts }
}

// The Owner hears about every credit that could not be taken back (spent already): written off,
// shown as 「欠扣」 in the admin.
export function alertShortfall(fields: Record<string, string | number | boolean | null>, shortfall: number | undefined, what: string): void {
  if (!shortfall) return
  captureAlert('clawback_shortfall', `${what}: ${shortfall} credits could not be clawed back (already spent)`, { fields })
}

async function recordIssue(deps: FulfilDeps, issue: Issue): Promise<IssuePayment> {
  const payment = await callRpc(
    deps.db,
    'record_payment_issue',
    { p_charge_id: issue.chargeId, p_kind: issue.kind, p_amount_refunded: issue.amountRefunded },
    issueSchema,
  )
  const fields = alertFields(issue, payment)
  logger.warn(`stripe charge ${issue.kind} recorded`, fields)
  const taken = issue.kind === 'refunded' && payment ? `${payment.credits_clawed_back ?? 0} credits clawed back` : 'see the dispute'
  captureAlert(ALERT[issue.kind], `Stripe charge ${issue.chargeId} ${issue.kind}: ${taken}`, { fields })
  if (issue.kind === 'refunded') alertShortfall(fields, payment?.clawback_shortfall, `Stripe charge ${issue.chargeId} refunded`)
  return payment
}

export async function recordRefund(deps: FulfilDeps, chargeId: string): Promise<IssueOutcome> {
  const charge = await deps.stripe.charges.retrieve(chargeId)
  const issue: Issue = { kind: 'refunded', chargeId: charge.id, amountRefunded: charge.amount_refunded, sourceId: charge.id }
  const payment = await recordIssue(deps, issue)
  // Never throws: a cancel that fails is alerted for the Owner to finish by hand.
  if (payment?.membership_ended) await cancelRefundedMembership(deps, payment)
  notifyOwner(ownerAlert(issue, payment))
  return payment ? 'recorded' : 'unknown_charge'
}

export async function recordDispute(deps: FulfilDeps, disputeId: string): Promise<IssueOutcome> {
  const dispute = await deps.stripe.disputes.retrieve(disputeId)
  const chargeId = typeof dispute.charge === 'string' ? dispute.charge : dispute.charge.id
  const issue: Issue = { kind: 'disputed', chargeId, amountRefunded: null, sourceId: dispute.id }
  const payment = await recordIssue(deps, issue)
  if (!deps.evidence) {
    // Only the admin replay and tests build deps without it; the webhook route always wires it.
    logger.warn('stripe dispute: no evidence config wired, dispute flow skipped', { dispute_id: dispute.id })
    notifyOwner(ownerAlert(issue, payment))
    return payment ? 'recorded' : 'unknown_charge'
  }
  // T82 + T71: the dispute row, the ban, the full clawback and the evidence draft; the Owner's
  // alert goes out from there, once, with the deadline, the admin link and what was taken back.
  const owner = ownerAlert(issue, payment) as DisputeOpenedAlert
  await openDispute({ stripe: deps.stripe, db: deps.db, evidence: deps.evidence }, dispute.id, owner)
  return payment ? 'recorded' : 'unknown_charge'
}
