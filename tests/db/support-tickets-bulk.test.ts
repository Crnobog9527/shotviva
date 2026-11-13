import { randomUUID } from 'node:crypto'

import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { bulkReplyTickets } from '@/core/support'

import { connectAdmin, createUser } from './helpers'
import { payment, ticket, ticketRow } from './support-fixtures'
import { serviceSupabase } from './supabase-env'

// The /admin/tickets batch on the real database: each ticket through admin_reply_ticket, with
// closed tickets and undecided refund requests left alone and reported.

let db: Client
const service = serviceSupabase()

beforeAll(async () => {
  db = await connectAdmin()
})

afterAll(async () => {
  await db.end()
})

const adminMessages = async (ticketId: string) =>
  (await db.query<{ body: string }>("select body from public.support_ticket_messages where ticket_id = $1 and author = 'admin' order by created_at", [ticketId])).rows.map((row) => row.body)

async function fixtures() {
  const author = await createUser(db)
  const feedback = await ticket(author)
  const other = await ticket(author, { type: 'account', body: 'Cannot sign in' })
  const refund = await ticket(author, { type: 'refund', body: 'Please refund', paymentId: await payment(db, author) })
  const closed = await ticket(author)
  await bulkReplyTickets(service, { ticketIds: [closed], body: '', close: true })
  return { feedback, other, refund, closed }
}

describe('bulk close', () => {
  it('closes each open ticket without a message and skips closed tickets and undecided refunds', async () => {
    const { feedback, other, refund, closed } = await fixtures()
    const gone = randomUUID()
    const outcome = await bulkReplyTickets(service, { ticketIds: [feedback, refund, other, closed, gone], body: '', close: true })
    expect(outcome.done).toEqual([feedback, other])
    expect(outcome.skipped).toEqual([
      { id: refund, reason: 'refund_undecided' },
      { id: closed, reason: 'closed' },
      { id: gone, reason: 'missing' },
    ])
    expect((await ticketRow(db, feedback))?.status).toBe('closed')
    expect((await ticketRow(db, other))?.status).toBe('closed')
    expect((await ticketRow(db, refund))?.status).toBe('open')
    expect(await adminMessages(feedback)).toEqual([])
  })
})

describe('bulk reply', () => {
  it('posts the same reply to each ticket, closing only when asked', async () => {
    const { feedback, other, refund } = await fixtures()
    const outcome = await bulkReplyTickets(service, { ticketIds: [feedback, other, refund], body: '  Fixed in today’s update.  ', close: false })
    expect(outcome.done).toEqual([feedback, other])
    expect(outcome.skipped).toEqual([{ id: refund, reason: 'refund_undecided' }])
    expect(await adminMessages(feedback)).toEqual(['Fixed in today’s update.'])
    expect((await ticketRow(db, other))?.status).toBe('replied')
    expect(await adminMessages(refund)).toEqual([])
  })

  it('refuses an empty reply that does not close, and a batch bigger than a page', async () => {
    const { feedback } = await fixtures()
    await expect(bulkReplyTickets(service, { ticketIds: [feedback], body: '  ', close: false })).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    await expect(bulkReplyTickets(service, { ticketIds: Array.from({ length: 31 }, () => randomUUID()), body: '', close: true })).rejects.toMatchObject({ code: 'INVALID_INPUT' })
  })
})
