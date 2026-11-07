import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

import { notifyOwner } from '../alerts'
import { AppError } from '../errors'
import type { TicketImageRow } from './images'
import { supportRpc } from './rpc'
import { addMessageSchema, createTicketSchema, ticketIdSchema } from './schema'

// Writes for signed-in users. `db` is the service-role client; the caller has already checked the
// session, and each SQL function checks ownership and the limits itself (one round trip each,
// AGENTS §5.1 rule 1).

const idRow = z.object({ id: z.uuid() })

// Images (T69) come already stored under tickets/<author>/<ticketId>/ (core/support/images), so
// a new ticket's id is chosen by the caller when it has images; without, the database picks it.
export type NewTicketImages = { ticketId: string; images: readonly TicketImageRow[] }

export async function createTicket(db: SupabaseClient, userId: string, input: unknown, attached?: NewTicketImages): Promise<string> {
  const parsed = createTicketSchema.safeParse(input)
  if (!parsed.success) throw new AppError('INVALID_INPUT', 'ticket input is invalid')
  const { type, body, paymentId, jobId } = parsed.data
  const row = await supportRpc(
    db,
    'create_support_ticket',
    {
      p_user_id: userId,
      p_type: type,
      p_body: body,
      p_payment_id: paymentId,
      p_job_id: jobId,
      p_ticket_id: attached?.ticketId ?? null,
      p_images: attached?.images ?? [],
    },
    idRow,
  )
  // The Owner hears of every new ticket in Feishu (T72); refund requests are tagged.
  await notifyOwner({ kind: 'ticket', ticketId: row.id, messageId: null, userId, ticketType: type })
  return row.id
}

export async function addTicketMessage(db: SupabaseClient, userId: string, input: unknown, images: readonly TicketImageRow[] = []): Promise<void> {
  const parsed = addMessageSchema.safeParse(input)
  if (!parsed.success) throw new AppError('INVALID_INPUT', 'message input is invalid')
  const message = await supportRpc(
    db,
    'add_ticket_message',
    { p_ticket_id: parsed.data.ticketId, p_user_id: userId, p_body: parsed.data.body, p_images: images },
    idRow,
  )
  await notifyOwner({ kind: 'ticket', ticketId: parsed.data.ticketId, messageId: message.id, userId, ticketType: null })
}

// Clears the "new reply" dot when the author opens the ticket; writes nothing if already read.
export async function markTicketSeen(db: SupabaseClient, userId: string, ticketId: string): Promise<void> {
  if (!ticketIdSchema.safeParse(ticketId).success) return
  await supportRpc(db, 'mark_ticket_seen', { p_ticket_id: ticketId, p_user_id: userId }, z.unknown())
}
