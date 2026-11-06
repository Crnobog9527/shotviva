import { randomUUID } from 'node:crypto'

import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { loadTodoCounts } from '@/core/admin'
import { applyPurchase, BASE_SUPPORT_REPLY_HOURS, TIER_LIMITS } from '@/core/billing'
import { addTicketMessage, listAdminTickets, replyTicket } from '@/core/support'

import { connectAdmin, createUser, serviceClient } from './helpers'
import { ticket } from './support-fixtures'
import { serviceSupabase } from './supabase-env'

// T27b (TASKS T27b 测试): due_at per tier, no tier at 48 hours, the order of the open list and
// the overdue count, plus SQL's support_reply_hours matching TIER_LIMITS.supportHours.

const HOUR = 3_600_000
let db: Client

beforeAll(async () => {
  db = await connectAdmin()
})

afterAll(async () => {
  await db.end()
})

async function withTier(tier: 'starter' | 'pro' | 'max' | null): Promise<string> {
  const user = await createUser(db)
  if (tier) await applyPurchase(serviceClient(), { userId: user, productId: `${tier}_monthly`, eventId: `cs_${randomUUID()}` })
  return user
}

// Moves the author's messages (and the ticket) back in time, so the ticket is due at a known time
// well before every other test's tickets.
async function backdate(ticketId: string, at: Date) {
  await db.query('update public.support_ticket_messages set created_at = $2 where ticket_id = $1', [ticketId, at])
  await db.query('update public.support_tickets set created_at = $2, last_message_at = $2, user_seen_at = $2 where id = $1', [ticketId, at])
}

async function openRow(ticketId: string) {
  // Backdated tickets sort first in the open view, so the first page has them.
  const page = await listAdminTickets(serviceSupabase(), { status: 'open' })
  return page.items.find((row) => row.id === ticketId)
}

describe('support_reply_hours', () => {
  it('matches TIER_LIMITS.supportHours, and no tier is the base time', async () => {
    for (const tier of ['starter', 'pro', 'max', null] as const) {
      const { data, error } = await serviceSupabase().rpc('support_reply_hours', { p_tier: tier })
      expect(error).toBeNull()
      expect(data).toBe(tier ? TIER_LIMITS[tier].supportHours : BASE_SUPPORT_REPLY_HOURS)
    }
    expect([TIER_LIMITS.starter, TIER_LIMITS.pro, TIER_LIMITS.max].map((limits) => limits.supportHours)).toEqual([48, 48, 24])
  })
})

describe('due_at (the author’s last message + their tier’s hours)', () => {
  it('is 48 hours for no tier, Starter and Pro, 24 hours for Max, and orders the open list soonest first', async () => {
    const base = new Date(Date.now() - 400 * 24 * HOUR)
    const cases = [
      { tier: null, hours: 48, offset: 0 },
      { tier: 'starter', hours: 48, offset: 1 },
      { tier: 'pro', hours: 48, offset: 2 },
      { tier: 'max', hours: 24, offset: 3 },
    ] as const
    const ids: string[] = []
    for (const c of cases) {
      const id = await ticket(await withTier(c.tier), { type: 'account', body: `SLA ${c.tier ?? 'none'}` })
      await backdate(id, new Date(base.getTime() + c.offset * HOUR))
      ids.push(id)
    }
    const page = await listAdminTickets(serviceSupabase(), { status: 'open' })
    for (const [i, c] of cases.entries()) {
      const row = page.items.find((item) => item.id === ids[i])
      expect(row).toMatchObject({ tier: c.tier, overdue: true })
      expect(Date.parse(row!.dueAt) - (base.getTime() + c.offset * HOUR)).toBe(c.hours * HOUR)
    }
    // Max (24h, sent last) is due before the three 48h tickets; then the order they were sent in.
    const order = page.items.map((row) => row.id).filter((id) => ids.includes(id))
    expect(order).toEqual([ids[3], ids[0], ids[1], ids[2]])

    // Keyset on (due_at, id): rows after the Max ticket, still soonest due first, without it.
    const max = page.items.find((row) => row.id === ids[3])!
    const { data } = await serviceSupabase().rpc('admin_list_tickets', {
      p_status: 'open',
      p_type: null,
      p_cursor_at: max.dueAt,
      p_cursor_id: max.id,
      p_limit: 101,
    })
    const after = data as { id: string; due_at: string }[]
    expect(after.map((row) => row.id)).not.toContain(ids[3])
    expect(after.map((row) => row.id).filter((id) => ids.includes(id))).toEqual([ids[0], ids[1], ids[2]])
    const dues = after.map((row) => Date.parse(row.due_at))
    expect(dues).toEqual([...dues].sort((x, y) => x - y))
    expect(dues[0]).toBeGreaterThanOrEqual(Date.parse(max.dueAt))
  })

  it('restarts from the author’s follow-up, and the Owner’s reply does not move it', async () => {
    const id = await ticket(await withTier(null), { type: 'other', body: 'First' })
    await backdate(id, new Date(Date.now() - 300 * 24 * HOUR))
    const due = (await openRow(id))!.dueAt
    await addTicketMessage(serviceSupabase(), (await db.query<{ user_id: string }>('select user_id from public.support_tickets where id = $1', [id])).rows[0]!.user_id, {
      ticketId: id,
      body: 'Any news?',
    })
    const page = await listAdminTickets(serviceSupabase(), { status: 'all', type: 'other' })
    const row = page.items.find((item) => item.id === id)!
    expect(Date.parse(row.dueAt)).toBeGreaterThan(Date.parse(due))
    expect(row.overdue).toBe(false)
    await replyTicket(serviceSupabase(), { ticketId: id, body: 'Looking', close: false })
    const after = (await listAdminTickets(serviceSupabase(), { status: 'replied', type: 'other' })).items.find((item) => item.id === id)!
    expect(after).toMatchObject({ dueAt: row.dueAt, overdue: false })
  })
})

describe('overdue count (admin_todo_counts.overdue_tickets)', () => {
  it('counts open tickets past due, not fresh ones, and drops one when it is answered', async () => {
    const before = (await loadTodoCounts(serviceSupabase())).overdueTickets
    const late = await ticket(await withTier('max'), { body: 'Late' })
    await backdate(late, new Date(Date.now() - 25 * HOUR))
    await ticket(await withTier('max'), { body: 'Fresh' })
    const during = (await loadTodoCounts(serviceSupabase())).overdueTickets
    expect(during).toBeGreaterThanOrEqual(before + 1)
    await replyTicket(serviceSupabase(), { ticketId: late, body: 'Sorry for the wait', close: false })
    expect((await openRow(late))).toBeUndefined()
  })
})
