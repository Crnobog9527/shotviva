import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { addTicketMessage, hasUnreadReply, listMyTickets, loadMyThread, markTicketSeen } from '@/core/support'

import { anonClient, connectAdmin, createUser } from './helpers'
import { adminReply, payment, ticket, ticketRow, workOf } from './support-fixtures'
import { serviceSupabase } from './supabase-env'
import { signedIn, wishlistUser } from './wishlist-fixtures'

// T27 (TASKS T27 测试) on the real database: ownership of what a ticket points at, the
// 5-per-24h limit, RLS, the unread dot and the account-deletion cascade.

let db: Client

beforeAll(async () => {
  db = await connectAdmin()
})

afterAll(async () => {
  await db.end()
})

describe('what a ticket points at must be the author’s own', () => {
  it('takes the author’s payment for a refund request and refuses someone else’s', async () => {
    const author = await createUser(db)
    const other = await createUser(db)
    const own = await payment(db, author)
    const theirs = await payment(db, other)

    const id = await ticket(author, { type: 'refund', body: 'Please refund', paymentId: own })
    expect((await ticketRow(db, id))?.status).toBe('open')
    await expect(ticket(author, { type: 'refund', body: 'x', paymentId: theirs })).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('needs a payment for a refund request, also when the function is called directly', async () => {
    const author = await createUser(db)
    await expect(ticket(author, { type: 'refund', body: 'x' })).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    const { error } = await serviceSupabase().rpc('create_support_ticket', {
      p_user_id: author,
      p_type: 'refund',
      p_body: 'x',
      p_payment_id: null,
      p_job_id: null,
    })
    expect(error?.message).toBe('INVALID_INPUT')
  })

  it('takes the author’s own work for an image issue and refuses someone else’s', async () => {
    const author = await createUser(db)
    const other = await createUser(db)
    await ticket(author, { type: 'image_issue', body: 'Blurry', jobId: await workOf(db, author) })
    await expect(ticket(author, { type: 'image_issue', body: 'x', jobId: await workOf(db, other) })).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('refuses a body over 2,000 characters', async () => {
    const author = await createUser(db)
    await expect(ticket(author, { body: 'a'.repeat(2001) })).rejects.toMatchObject({ code: 'INVALID_INPUT' })
  })
})

describe('per-account limit (5 per 24 hours)', () => {
  it('refuses the 6th ticket, and parallel submits cannot slip past it', async () => {
    const author = await createUser(db)
    const results = await Promise.allSettled(Array.from({ length: 7 }, (_, i) => ticket(author, { body: `#${i}` })))
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(5)
    for (const result of results.filter((r) => r.status === 'rejected')) {
      expect((result as PromiseRejectedResult).reason).toMatchObject({ code: 'RATE_LIMITED' })
    }
  })

  it('counts only the last 24 hours', async () => {
    const author = await createUser(db)
    for (let i = 0; i < 5; i++) await ticket(author)
    await db.query("update public.support_tickets set created_at = now() - interval '25 hours' where user_id = $1", [author])
    await expect(ticket(author)).resolves.toEqual(expect.any(String))
  })
})

describe('RLS: users only see their own tickets', () => {
  it('lists and opens the author’s tickets; another account’s ticket reads as missing', async () => {
    const author = await wishlistUser(db, { session: true, eligible: false })
    const other = await createUser(db)
    const mine = await ticket(author.id, { body: 'Mine' })
    const theirs = await ticket(other, { body: 'Theirs' })
    const client = await signedIn(author)

    const page = await listMyTickets(client, author.id)
    expect(page.items.map((item) => item.id)).toEqual([mine])
    expect((await loadMyThread(client, mine))?.messages.map((m) => m.body)).toEqual(['Mine'])
    expect(await loadMyThread(client, theirs)).toBeNull()
    // Asking for the other user's rows by user_id still returns nothing.
    expect((await listMyTickets(client, other)).items).toEqual([])
    const messages = await client.from('support_ticket_messages').select('body')
    expect(messages.data?.map((m) => m.body)).toEqual(['Mine'])
  })

  it('gives anonymous callers and direct client writes nothing', async () => {
    expect((await anonClient().select('support_tickets')).ok).toBe(false)
    const author = await wishlistUser(db, { session: true, eligible: false })
    const client = await signedIn(author)
    const insert = await client.from('support_tickets').insert({ user_id: author.id, type: 'other' })
    expect(insert.error).not.toBeNull()
    const rpc = await client.rpc('create_support_ticket', { p_user_id: author.id, p_type: 'other', p_body: 'x', p_payment_id: null, p_job_id: null })
    expect(rpc.error).not.toBeNull()
  })
})

describe('unread dot', () => {
  it('is set by an Owner reply only and cleared by mark_ticket_seen', async () => {
    const author = await wishlistUser(db, { session: true, eligible: false })
    const client = await signedIn(author)
    const id = await ticket(author.id)
    expect(await hasUnreadReply(client, author.id)).toBe(false)

    await adminReply(id)
    expect(await hasUnreadReply(client, author.id)).toBe(true)
    expect((await listMyTickets(client, author.id)).items[0]).toMatchObject({ id, status: 'replied', unread: true })

    await markTicketSeen(serviceSupabase(), author.id, id)
    expect(await hasUnreadReply(client, author.id)).toBe(false)
  })

  it('stays clear after the author’s own message, which puts an answered ticket back to open', async () => {
    const author = await createUser(db)
    const id = await ticket(author)
    await adminReply(id, 'Done')
    await addTicketMessage(serviceSupabase(), author, { ticketId: id, body: 'Still broken' })
    const row = await ticketRow(db, id)
    expect(row).toMatchObject({ status: 'open', closed_at: null })
    expect(row!.last_message_at.getTime()).toBeLessThanOrEqual(row!.user_seen_at.getTime())
  })

  it('does not let one account mark or add to another’s ticket', async () => {
    const author = await createUser(db)
    const other = await createUser(db)
    const id = await ticket(author)
    await adminReply(id)
    await markTicketSeen(serviceSupabase(), other, id)
    const row = await ticketRow(db, id)
    expect(row!.last_message_at.getTime()).toBeGreaterThan(row!.user_seen_at.getTime())
    await expect(addTicketMessage(serviceSupabase(), other, { ticketId: id, body: 'hi' })).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
})

describe('a closed ticket', () => {
  async function messageCount(id: string) {
    const { rows } = await db.query<{ n: number }>('select count(*)::int as n from public.support_ticket_messages where ticket_id = $1', [id])
    return rows[0]!.n
  }

  it('refuses the author’s message with TICKET_CLOSED, writes nothing and stays closed', async () => {
    const author = await createUser(db)
    const id = await ticket(author)
    await adminReply(id, 'Done', true)
    const before = await ticketRow(db, id)
    const messages = await messageCount(id)

    await expect(addTicketMessage(serviceSupabase(), author, { ticketId: id, body: 'Still broken' })).rejects.toMatchObject({ code: 'TICKET_CLOSED' })
    const { error } = await serviceSupabase().rpc('add_ticket_message', { p_ticket_id: id, p_user_id: author, p_body: 'Direct call' })
    expect(error?.message).toBe('TICKET_CLOSED')

    expect(await ticketRow(db, id)).toEqual(before)
    expect(before).toMatchObject({ status: 'closed', closed_at: expect.any(Date) })
    expect(await messageCount(id)).toBe(messages)
  })

  it('still reads as missing to another account', async () => {
    const author = await createUser(db)
    const other = await createUser(db)
    const id = await ticket(author)
    await adminReply(id, 'Done', true)
    await expect(addTicketMessage(serviceSupabase(), other, { ticketId: id, body: 'hi' })).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('takes messages again once the Owner answers it without closing', async () => {
    const author = await createUser(db)
    const id = await ticket(author)
    await adminReply(id, 'Done', true)
    await adminReply(id, 'Reopening this for you')
    expect((await ticketRow(db, id))?.status).toBe('replied')
    await addTicketMessage(serviceSupabase(), author, { ticketId: id, body: 'Thanks' })
    expect(await ticketRow(db, id)).toMatchObject({ status: 'open', closed_at: null })
  })

  it('leaves open tickets taking messages', async () => {
    const author = await createUser(db)
    const id = await ticket(author)
    await addTicketMessage(serviceSupabase(), author, { ticketId: id, body: 'More detail' })
    expect((await ticketRow(db, id))?.status).toBe('open')
    expect(await messageCount(id)).toBe(2)
  })
})

describe('account deletion', () => {
  it('deletes the tickets and their messages with the account', async () => {
    const author = await createUser(db)
    const id = await ticket(author, { type: 'refund', body: 'Refund', paymentId: await payment(db, author) })
    await adminReply(id)
    await db.query('delete from auth.users where id = $1', [author])
    expect(await ticketRow(db, id)).toBeNull()
    const { rowCount } = await db.query('select 1 from public.support_ticket_messages where ticket_id = $1', [id])
    expect(rowCount).toBe(0)
  })
})
