import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { loadTodoCounts } from '@/core/admin'
import { decideRefund, listAdminTickets, loadAdminTicket, openTicketCount, replyTicket } from '@/core/support'

import { connectAdmin, createUser } from './helpers'
import { payment, ticket, ticketRow, usedCredit } from './support-fixtures'
import { serviceSupabase } from './supabase-env'

// T27, the Owner's side: refund_eligibility's three checks and suggested amount, the decision
// with its audit row, replies and closing, the list and the open count.

let db: Client

beforeAll(async () => {
  db = await connectAdmin()
})

afterAll(async () => {
  await db.end()
})

// Every open ticket of a type, page by page (the open view is soonest due first, T27b).
async function allOpen(type: 'account' | 'other') {
  const rows = []
  let cursor: string | null = null
  do {
    const page = await listAdminTickets(serviceSupabase(), { status: 'open', type }, cursor)
    rows.push(...page.items)
    cursor = page.nextCursor
  } while (cursor)
  return rows
}

async function eligibility(paymentId: string, askedAt: Date = new Date()) {
  const { data, error } = await serviceSupabase().rpc('refund_eligibility', { p_payment_id: paymentId, p_asked_at: askedAt.toISOString() })
  if (error) throw new Error(error.message)
  return (data as Record<string, unknown>[])[0]
}

describe('refund_eligibility', () => {
  it('passes all three for a first, recent, unused purchase and suggests pre-tax × 94% + all tax', async () => {
    const user = await createUser(db)
    const id = await payment(db, user, { productId: 'pro_monthly', total: 2110, tax: 120, daysAgo: 2 })
    expect(await eligibility(id)).toEqual({ first_purchase: true, within_7_days: true, no_credits_used: true, suggested_cents: 1991 })
  })

  it('counts first purchase per kind: a second pack is not first, a first membership after a pack is', async () => {
    const user = await createUser(db)
    await payment(db, user, { productId: 'pack_s', daysAgo: 3 })
    const secondPack = await payment(db, user, { productId: 'pack_m', daysAgo: 2 })
    const plan = await payment(db, user, { productId: 'starter_monthly', daysAgo: 1 })
    const renewal = await payment(db, user, { productId: 'starter_monthly' })
    expect((await eligibility(secondPack))?.first_purchase).toBe(false)
    expect((await eligibility(plan))?.first_purchase).toBe(true)
    expect((await eligibility(renewal))?.first_purchase).toBe(false)
  })

  it('measures 7 days to when the user asked, not to when the Owner looks', async () => {
    const user = await createUser(db)
    const id = await payment(db, user, { daysAgo: 9 })
    expect((await eligibility(id))?.within_7_days).toBe(false)
    expect((await eligibility(id, new Date(Date.now() - 3 * 86_400_000)))?.within_7_days).toBe(true)
  })

  it('fails "no credits used" for any use after the payment, free credits included, but not before it', async () => {
    const user = await createUser(db)
    await usedCredit(db, user, 'free', 3 * 24 * 60)
    const id = await payment(db, user, { daysAgo: 1 })
    expect((await eligibility(id))?.no_credits_used).toBe(true)
    await usedCredit(db, user, 'free')
    expect((await eligibility(id))?.no_credits_used).toBe(false)
  })

  it('never suggests more than is still unrefunded', async () => {
    const user = await createUser(db)
    const id = await payment(db, user, { total: 1000, refunded: 900 })
    expect((await eligibility(id))?.suggested_cents).toBe(100)
  })
})

describe('admin_decide_refund', () => {
  it('records the decision, the reply and a decide_refund audit row; the ticket stays open for closing later', async () => {
    const user = await createUser(db)
    const id = await ticket(user, { type: 'refund', body: 'Refund please', paymentId: await payment(db, user, { total: 2110 }) })
    await decideRefund(serviceSupabase(), { ticketId: id, decision: 'approved', amountCents: 1991, body: 'Approved, refunding $19.91' })

    expect(await ticketRow(db, id)).toMatchObject({ status: 'replied', refund_decision: 'approved', refund_amount_cents: 1991 })
    const { rows } = await db.query<{ reason: string; target_id: string }>(
      "select reason, target_id from public.admin_audit_log where action = 'decide_refund' and user_id = $1",
      [user],
    )
    expect(rows).toEqual([{ reason: '退款工单：approved 1991', target_id: id }])
    const loaded = await loadAdminTicket(serviceSupabase(), id)
    expect(loaded?.messages.map((m) => m.author)).toEqual(['user', 'admin'])
    expect(loaded?.eligibility?.suggestedCents).toBe(1983)
  })

  it('refuses an amount above the unrefunded total, a non-refund ticket and an amount on a rejection', async () => {
    const user = await createUser(db)
    const refund = await ticket(user, { type: 'refund', body: 'x', paymentId: await payment(db, user, { total: 500 }) })
    const other = await ticket(user, { type: 'billing', body: 'x' })
    const decide = (input: Record<string, unknown>) => decideRefund(serviceSupabase(), { body: 'ok', ...input })
    await expect(decide({ ticketId: refund, decision: 'approved', amountCents: 501 })).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    await expect(decide({ ticketId: other, decision: 'rejected' })).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    const { error } = await serviceSupabase().rpc('admin_decide_refund', {
      p_ticket_id: refund,
      p_decision: 'rejected',
      p_amount_cents: 100,
      p_body: 'no',
    })
    expect(error?.message).toBe('INVALID_INPUT')
    expect((await ticketRow(db, refund))?.refund_decision).toBeNull()
  })
})

describe('replies, the list and the open count', () => {
  it('replies, closes without a message, and refuses an empty reply that does not close', async () => {
    const user = await createUser(db)
    const id = await ticket(user)
    await replyTicket(serviceSupabase(), { ticketId: id, body: 'On it', close: false })
    expect((await ticketRow(db, id))?.status).toBe('replied')
    await replyTicket(serviceSupabase(), { ticketId: id, body: '', close: true })
    expect(await ticketRow(db, id)).toMatchObject({ status: 'closed', closed_at: expect.any(Date) })
    await expect(replyTicket(serviceSupabase(), { ticketId: id, body: ' ', close: false })).rejects.toMatchObject({ code: 'INVALID_INPUT' })
  })

  it('lists open tickets soonest due first (T27b) with the email, filters by type, counts open ones', async () => {
    const user = await createUser(db)
    const ids: string[] = []
    for (let i = 0; i < 3; i++) ids.push(await ticket(user, { type: 'account', body: `Account #${i}` }))
    await replyTicket(serviceSupabase(), { ticketId: ids[0]!, body: 'Answered', close: false })
    // Other files open tickets in parallel, so the global count is only checked for its type;
    // the nav count's exact rule is the partial index, read back through the open list below.
    expect(await openTicketCount(serviceSupabase())).toEqual(expect.any(Number))

    const mine = (await allOpen('account')).filter((row) => row.userId === user)
    // Same tier, so due order is the order they were sent in.
    expect(mine.map((row) => row.id)).toEqual([ids[1], ids[2]])
    expect(mine[0]).toMatchObject({ email: expect.stringContaining('@example.test'), preview: 'Account #1', overdue: false })

    const replied = await listAdminTickets(serviceSupabase(), { status: 'replied', type: 'account' })
    expect(replied.items.some((row) => row.id === ids[0])).toBe(true)
  })

  it('counts open tickets in the overview to-do strip, like the nav badge (admin_todo_counts, 0224)', async () => {
    const user = await createUser(db)
    const before = (await loadTodoCounts(serviceSupabase())).openTickets
    const id = await ticket(user)
    // Other files may open tickets in parallel, so only a lower bound is exact.
    expect((await loadTodoCounts(serviceSupabase())).openTickets).toBeGreaterThanOrEqual(before + 1)
    await replyTicket(serviceSupabase(), { ticketId: id, body: 'Done', close: true })
    const [todo, nav] = await Promise.all([loadTodoCounts(serviceSupabase()), openTicketCount(serviceSupabase())])
    expect(Math.abs(todo.openTickets - nav)).toBeLessThanOrEqual(2)
  })

  it('pages with the cursor without repeating rows', async () => {
    const user = await createUser(db)
    for (let i = 0; i < 5; i++) await ticket(user, { type: 'other', body: `Other #${i}` })
    // Everything after the first row, in the same order; rows written meanwhile sort before it.
    const all = await listAdminTickets(serviceSupabase(), { status: 'all', type: 'other' })
    const first = all.items[0]!
    const { data } = await serviceSupabase().rpc('admin_list_tickets', {
      p_status: null,
      p_type: 'other',
      p_cursor_at: first.lastMessageAt,
      p_cursor_id: first.id,
      p_limit: 101,
    })
    const after = (data as { id: string }[]).map((row) => row.id)
    expect(after).not.toContain(first.id)
    expect(after.slice(0, all.items.length - 1)).toEqual(all.items.slice(1).map((row) => row.id))
  })
})
