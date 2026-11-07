import 'server-only'

import type Stripe from 'stripe'
import { z } from 'zod'

import type { DisputeOpenedAlert } from '../../../alerts'
import { AppError } from '../../../errors'
import { logger } from '../../../logger'
import { callRpc, type RpcClient } from '../../rpc'
import type { StripeApi } from '../client'
import { alertDisputeOpened } from './alerts'
import type { DisputeEvidenceConfig } from './config'
import { buildEvidence } from './evidence'
import { evidenceFactsSchema } from './facts'
import { isRespondable } from './labels'

// charge.dispute.created, after record_payment_issue (ARCHITECTURE §6.3 「拒付申诉证据」, T82):
// record the dispute and ban the buyer (open_payment_dispute, idempotent by dispute id), stage
// the evidence draft on Stripe with submit = false, alert the Owner once. A draft that fails
// throws, so the webhook answers 500 and Stripe's redelivery drafts again (the row says
// whether it is drafted); the ban and the alert are not repeated.

export type DisputeDeps = { stripe: StripeApi; db: RpcClient; evidence: DisputeEvidenceConfig }

const openedSchema = z.object({
  created: z.boolean(),
  user_id: z.uuid().nullable(),
  payment_id: z.number().int().nullable(),
  responder: z.enum(['shotviva', 'stripe']),
  auto_banned: z.boolean(),
  drafted: z.boolean(),
})

type Opened = z.infer<typeof openedSchema>

const dueBy = (dispute: Stripe.Dispute) => {
  const seconds = dispute.evidence_details?.due_by
  return seconds ? new Date(seconds * 1000) : null
}

function chargeOf(dispute: Stripe.Dispute): { id: string; billing: Stripe.Charge.BillingDetails | null } {
  if (typeof dispute.charge === 'string') return { id: dispute.charge, billing: null }
  return { id: dispute.charge.id, billing: dispute.charge.billing_details ?? null }
}

async function open(deps: DisputeDeps, dispute: Stripe.Dispute): Promise<Opened> {
  return callRpc(
    deps.db,
    'open_payment_dispute',
    {
      p_dispute_id: dispute.id,
      p_charge_id: chargeOf(dispute).id,
      p_amount: dispute.amount,
      p_currency: dispute.currency,
      p_reason: dispute.reason,
      p_due_by: dueBy(dispute)?.toISOString() ?? null,
      p_managed_default: deps.evidence.managedPayments,
    },
    openedSchema,
  )
}

// Stripe takes evidence only while it waits for a response, and only before the one submission.
export function canStage(dispute: Stripe.Dispute): boolean {
  return isRespondable(dispute.status) && (dispute.evidence_details?.submission_count ?? 0) === 0 && dueBy(dispute) !== null
}

async function draft(deps: DisputeDeps, dispute: Stripe.Dispute): Promise<void> {
  const raw = await callRpc(deps.db, 'dispute_evidence_facts', { p_dispute_id: dispute.id }, z.unknown())
  const parsed = evidenceFactsSchema.safeParse(raw)
  // Paths only, never values: the facts hold an email and IPs.
  if (!parsed.success) throw new AppError('INTERNAL', `dispute_evidence_facts shape: ${parsed.error.issues.map((i) => i.path.join('.')).join(', ')}`)
  const facts = parsed.data
  const billing = chargeOf(dispute).billing
  const context = deps.evidence.context(facts.payment?.product_id ?? null, { email: billing?.email ?? null, name: billing?.name ?? null })
  await deps.stripe.disputes.update(dispute.id, { evidence: buildEvidence(facts, context), submit: false })
  await callRpc(deps.db, 'mark_dispute_drafted', { p_dispute_id: dispute.id }, z.boolean().nullable())
}

export type DisputeOutcome = 'drafted' | 'recorded' | 'replayed'

// `owner`: the Feishu alert payment-issues.ts built for this dispute (payment facts, T71 clawback);
// sent here once, with the deadline and the ban added, when the dispute is new.
export async function openDispute(deps: DisputeDeps, disputeId: string, owner: DisputeOpenedAlert): Promise<DisputeOutcome> {
  const dispute = await deps.stripe.disputes.retrieve(disputeId, { expand: ['charge'] })
  const opened = await open(deps, dispute)
  const stage = !opened.drafted && canStage(dispute)
  if (stage) await draft(deps, dispute)
  if (opened.created) {
    const facts = {
      disputeId: dispute.id,
      amount: dispute.amount,
      currency: dispute.currency,
      reason: dispute.reason,
      dueBy: dueBy(dispute),
      responder: opened.responder,
      autoBanned: opened.auto_banned,
      userId: opened.user_id,
      productId: owner.productId,
    }
    alertDisputeOpened(facts, owner)
  }
  logger.info('stripe dispute opened', { dispute_id: dispute.id, created: opened.created, staged: stage, responder: opened.responder })
  if (stage) return 'drafted'
  return opened.created ? 'recorded' : 'replayed'
}
