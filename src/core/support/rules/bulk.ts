import type { TicketStatus, TicketType } from './index'

// Batches on /admin/tickets (client-safe; the server applies the same rule per ticket). A batch
// only closes, or replies with one text (optionally closing); money stays one ticket at a time.

export type BulkTicketSkip = 'missing' | 'closed' | 'refund_undecided' | 'renewal_pending' | 'failed'

export type BulkTicketFacts = { status: TicketStatus; type: TicketType; refundDecided: boolean; renewalPending: boolean }

// Why a ticket is left out of a batch, or null to go ahead:
// - closed: nothing to close, and a batch reply must not quietly reopen it;
// - a refund request with no decision yet: approving or refusing it is a money call, made in its
//   dialog; a batch neither answers nor closes it;
// - a billing ticket whose renewal is not checked yet: the dialog refuses to close it too.
export function bulkTicketSkip(facts: BulkTicketFacts | undefined, close: boolean): BulkTicketSkip | null {
  if (!facts) return 'missing'
  if (facts.status === 'closed') return 'closed'
  if (facts.type === 'refund' && !facts.refundDecided) return 'refund_undecided'
  if (close && facts.renewalPending) return 'renewal_pending'
  return null
}
