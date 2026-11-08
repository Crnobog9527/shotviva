import 'server-only'

import { z } from 'zod'

import { notifyOwner } from '../../../alerts'
import { captureAlert } from '../../../analytics/capture-error'
import { logger } from '../../../logger'
import { callRpc } from '../../rpc'
import type { FulfilDeps } from '../fulfil'

// charge.dispute.closed (ARCHITECTURE §6.2 「拒付」, §6.3, T71): Stripe's final word, re-read from
// Stripe. When the money stays with us (won, or an inquiry closed as warning_closed) the credits
// the dispute took go back to the user; otherwise they stay taken. close_payment_dispute does it in
// one transaction, once per dispute: only the first delivery restores and alerts the Owner.
// A dispute we have no row for (opened before T82) is only logged and alerted in Sentry.

export type CloseOutcome = 'kept' | 'lost' | 'replayed' | 'unknown_dispute'

const closedSchema = z
  .object({
    first_close: z.boolean(),
    kept: z.boolean(),
    closed_status: z.string(),
    credits_restored: z.number().int(),
    user_id: z.uuid().nullable(),
    payment_id: z.number().int().nullable(),
    product_id: z.string().nullable(),
    amount: z.number().int(),
    currency: z.string(),
  })
  .nullable()

type Closed = NonNullable<z.infer<typeof closedSchema>>

function alert(disputeId: string, closed: Closed): void {
  const fields = {
    dispute_id: disputeId,
    status: closed.closed_status,
    user_id: closed.user_id,
    payment_id: closed.payment_id,
    credits_restored: closed.credits_restored,
  }
  const result = closed.kept ? `kept, ${closed.credits_restored} credits returned` : 'lost, credits stay clawed back'
  captureAlert('dispute_closed', `Stripe dispute ${disputeId} closed (${closed.closed_status}): ${result}`, { level: 'warning', fields })
  notifyOwner({
    kind: 'dispute_closed',
    disputeId,
    won: closed.kept,
    creditsReturned: closed.kept ? closed.credits_restored : null,
    userId: closed.user_id,
    productId: closed.product_id,
    amount: { cents: closed.amount, currency: closed.currency },
  })
}

export async function closeDispute(deps: FulfilDeps, disputeId: string): Promise<CloseOutcome> {
  const dispute = await deps.stripe.disputes.retrieve(disputeId)
  const closed = await callRpc(deps.db, 'close_payment_dispute', { p_dispute_id: dispute.id, p_status: dispute.status }, closedSchema)
  if (!closed) {
    logger.warn('stripe dispute closed: no dispute row', { dispute_id: dispute.id, status: dispute.status })
    captureAlert('dispute_closed', `Stripe dispute ${dispute.id} closed (${dispute.status}) but was never recorded: check credits by hand`, {
      fields: { dispute_id: dispute.id, status: dispute.status, known_dispute: false },
    })
    return 'unknown_dispute'
  }
  logger.info('stripe dispute closed', { dispute_id: dispute.id, status: closed.closed_status, first: closed.first_close, restored: closed.credits_restored })
  if (!closed.first_close) return 'replayed'
  alert(dispute.id, closed)
  return closed.kept ? 'kept' : 'lost'
}
