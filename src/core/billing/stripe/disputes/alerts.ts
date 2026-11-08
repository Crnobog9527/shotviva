import 'server-only'

import { notifyOwner, type DisputeOpenedAlert } from '../../../alerts'
import { captureAlert } from '../../../analytics/capture-error'

// Dispute alerts (T82). The Owner's plain-Chinese message goes through core/alerts (T72, Feishu):
// the dispute_opened alert now carries the deadline, who answers and the ban, and links the admin
// 「拒付」 page; dispute_due_soon is the one three-day reminder. Sentry keeps the developers' copy.
// Fields carry ids only, never the email.

export type DisputeAlertFacts = {
  disputeId: string
  amount: number
  currency: string
  reason: string
  dueBy: Date | null
  responder: 'shotviva' | 'stripe'
  autoBanned: boolean
  userId: string | null
  productId: string | null
  // Did the evidence draft reach Stripe on this delivery (see DisputeEvidenceFacts.draft).
  draft: 'staged' | 'failed' | 'skipped'
}

const fields = (f: Omit<DisputeAlertFacts, 'draft'> & { draft?: DisputeAlertFacts['draft'] }) => ({
  dispute_id: f.disputeId,
  user_id: f.userId,
  amount: f.amount,
  currency: f.currency,
  reason: f.reason,
  responder: f.responder,
  due_by: f.dueBy?.toISOString() ?? null,
  auto_banned: f.autoBanned,
  draft: f.draft ?? null,
})

// `base` is the payment-side alert payment-issues.ts built (amount, product, T71 clawback).
export function alertDisputeOpened(f: DisputeAlertFacts, base: DisputeOpenedAlert): void {
  captureAlert('dispute_opened', `Stripe dispute ${f.disputeId}: evidence ${f.draft} (${f.responder})`, { fields: fields(f) })
  // T71: the clawback could not take everything back (the credits were spent).
  const shortfall = base.credits?.shortfall ?? 0
  if (shortfall > 0) {
    captureAlert('clawback_shortfall', `Stripe dispute ${f.disputeId}: ${shortfall} credits could not be clawed back (already spent)`, {
      fields: { ...fields(f), credits_clawed_back: base.credits?.clawedBack ?? null, clawback_shortfall: shortfall },
    })
  }
  notifyOwner({ ...base, evidence: { dueBy: f.dueBy?.toISOString() ?? null, responder: f.responder, autoBanned: f.autoBanned, draft: f.draft } })
}

export function alertDisputeDueSoon(f: Omit<DisputeAlertFacts, 'draft'> & { dueBy: Date }): void {
  captureAlert('dispute_due_soon', `Stripe dispute ${f.disputeId}: evidence not submitted, due within 3 days`, { fields: fields(f) })
  notifyOwner({
    kind: 'dispute_due_soon',
    disputeId: f.disputeId,
    userId: f.userId,
    productId: f.productId,
    amount: { cents: f.amount, currency: f.currency },
    dueBy: f.dueBy.toISOString(),
  })
}
