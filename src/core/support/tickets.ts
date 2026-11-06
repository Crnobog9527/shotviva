import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

import { AppError } from '../errors'
import { supportRpc } from './rpc'
import { addMessageSchema, createTicketSchema, ticketIdSchema } from './schema'

// Writes for signed-in users. `db` is the service-role client; the caller has already checked the
// session, and each SQL function checks ownership and the limits itself (one round trip each,
// AGENTS §5.1 rule 1).

const idRow = z.object({ id: z.uuid() })

export async function createTicket(db: SupabaseClient, userId: string, input: unknown): Promise<string> {
  const parsed = createTicketSchema.safeParse(input)
  if (!parsed.success) throw new AppError('INVALID_INPUT', 'ticket input is invalid')
  const { type, body, paymentId, jobId } = parsed.data
  const row = await supportRpc(
    db,
    'create_support_ticket',
    { p_user_id: userId, p_type: type, p_body: body, p_payment_id: paymentId, p_job_id: jobId },
    idRow,
  )
  return row.id
}

export async function addTicketMessage(db: SupabaseClient, userId: string, input: unknown): Promise<void> {
  const parsed = addMessageSchema.safeParse(input)
  if (!parsed.success) throw new AppError('INVALID_INPUT', 'message input is invalid')
  await supportRpc(
    db,
    'add_ticket_message',
    { p_ticket_id: parsed.data.ticketId, p_user_id: userId, p_body: parsed.data.body },
    idRow,
  )
}

// Clears the "new reply" dot when the author opens the ticket; writes nothing if already read.
export async function markTicketSeen(db: SupabaseClient, userId: string, ticketId: string): Promise<void> {
  if (!ticketIdSchema.safeParse(ticketId).success) return
  await supportRpc(db, 'mark_ticket_seen', { p_ticket_id: ticketId, p_user_id: userId }, z.unknown())
}
