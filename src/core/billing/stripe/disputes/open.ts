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
// record the dispute, ban the buyer and take the purchase's credits back in full (T71; all in
// open_payment_dispute, idempotent by dispute id), stage
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
  // T71: the payment's clawback totals once the dispute took everything back (null: no payment
  // row; absent from a database without T71).
  credits_clawed_back: z.number().int().nullable().optional(),
  clawback_shortfall: z.number().int().nullable().optional(),
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
// The draft is tried before the alert so the alert can say how it went, and its failure is held
// until the alert is out: the alert is sent once (on the delivery that created the row), so a draft
// that keeps failing still reaches the Owner. The error is then rethrown for Stripe's redelivery.
export async function openDispute(deps: DisputeDeps, disputeId: string, owner: DisputeOpenedAlert): Promise<DisputeOutcome> {
  const dispute = await deps.stripe.disputes.retrieve(disputeId, { expand: ['charge'] })
  const opened = await open(deps, dispute)
  const stage = !opened.drafted && canStage(dispute)
  const failure = stage ? await draft(deps, dispute).then(() => null, (error: unknown) => ({ error })) : null
  if (opened.created) alertDisputeOpened(alertFacts(dispute, opened, owner, draftState(stage, failure !== null)), withClawback(owner, opened))
  logger.info('stripe dispute opened', { dispute_id: dispute.id, created: opened.created, staged: stage, failed: failure !== null, responder: opened.responder })
  if (failure) throw failure.error
  if (stage) return 'drafted'
  return opened.created ? 'recorded' : 'replayed'
}

// What open_payment_dispute took back replaces the payment-side numbers (taken before the dispute).
function withClawback(owner: DisputeOpenedAlert, opened: Opened): DisputeOpenedAlert {
  if (opened.credits_clawed_back === undefined || opened.credits_clawed_back === null) return owner
  return { ...owner, credits: { clawedBack: opened.credits_clawed_back, shortfall: opened.clawback_shortfall ?? 0 } }
}

const draftState = (stage: boolean, failed: boolean) => (failed ? 'failed' : stage ? 'staged' : 'skipped')

function alertFacts(dispute: Stripe.Dispute, opened: Opened, owner: DisputeOpenedAlert, draft: 'staged' | 'failed' | 'skipped') {
  return {
    disputeId: dispute.id,
    amount: dispute.amount,
    currency: dispute.currency,
    reason: dispute.reason,
    dueBy: dueBy(dispute),
    responder: opened.responder,
    autoBanned: opened.auto_banned,
    userId: opened.user_id,
    productId: owner.productId,
    draft,
  }
}
