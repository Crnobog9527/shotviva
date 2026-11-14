import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

import { eachRecord, type BulkOutcome } from '../admin/shell/bulk/bulk-outcome'
import { AppError } from '../errors'
import { logger } from '../logger'
import { replyTicket } from './admin'
import { PAGE_SIZE } from './cursor'
import { readFailed } from './rpc'
import { BODY_MAX, TICKET_STATUSES, TICKET_TYPES } from './rules'
import { bulkTicketSkip, type BulkTicketFacts, type BulkTicketSkip } from './rules/bulk'
import { ticketIdSchema } from './schema'
import { loadRenewalReview } from './waffo-renewal'

// A batch is at most one page of the list.
export const bulkReplySchema = z
  .object({
    ticketIds: z.array(ticketIdSchema).min(1).max(PAGE_SIZE),
    body: z.string().trim().max(BODY_MAX),
    close: z.boolean(),
  })
  .refine((input) => input.close || input.body.length > 0, { path: ['body'], message: 'reply required' })

const factsRow = z.object({ id: z.uuid(), status: z.enum(TICKET_STATUSES), type: z.enum(TICKET_TYPES), refund_decision: z.string().nullable() })

// One read for the batch (primary key), plus the renewal review of each billing ticket a close
// would touch: the same check the dialog's close makes.
async function loadFacts(db: SupabaseClient, ids: readonly string[], close: boolean): Promise<Map<string, BulkTicketFacts>> {
  const { data, error } = await db.from('support_tickets').select('id, status, type, refund_decision').in('id', [...ids])
  if (error) readFailed('bulk facts', error)
  const rows = factsRow.array().parse(data)
  const pending = await Promise.all(
    rows.map(async (row) => {
      if (!close || row.type !== 'billing' || row.status === 'closed') return false
      const review = await loadRenewalReview(db, row.id)
      return !!review && !review.resolution
    }),
  )
  return new Map(
    rows.map((row, index) => [row.id, { status: row.status, type: row.type, refundDecided: row.refund_decision !== null, renewalPending: pending[index] }]),
  )
}

// Each ticket goes through admin_reply_ticket on its own, exactly as its dialog would send it (no
// images); one that fails does not stop the rest. Returns what happened to each.
export async function bulkReplyTickets(db: SupabaseClient, input: unknown): Promise<BulkOutcome<BulkTicketSkip>> {
  const parsed = bulkReplySchema.safeParse(input)
  if (!parsed.success) throw new AppError('INVALID_INPUT', '请填写回复内容（最多 2000 字），一次最多一页')
  const { ticketIds, body, close } = parsed.data
  const facts = await loadFacts(db, ticketIds, close)
  return eachRecord<BulkTicketSkip>(
    ticketIds,
    (id) => bulkTicketSkip(facts.get(id), close),
    (id) => replyTicket(db, { ticketId: id, body, close, images: [] }),
    'failed',
    (id, error) => logger.error('admin.tickets.bulk.failed', { ticketId: id, error }),
  )
}
