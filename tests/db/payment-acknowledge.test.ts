import { randomUUID } from 'node:crypto'

import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { acknowledgePayment, loadAttentionIds, unacknowledgePayment } from '@/core/admin'

import { anonClient, connectAdmin, createUser, serviceClient } from './helpers'

// 「标记已知晓」 (ARCHITECTURE §10, 1881/1882): a mark takes a refunded or disputed payment out of
// the overview counter without touching money; it is idempotent and audited; only an admin can set
// it; a later change of status or refunded amount brings the payment back; an open dispute keeps
// counting while marked. Other files add payments in parallel, so checks go by payment id.

let db: Client
let adminId: string
const service = serviceClient()

beforeAll(async () => {
  db = await connectAdmin()
  adminId = await createUser(db)
  await db.query("update public.profiles set role = 'admin' where id = $1", [adminId])
})

afterAll(async () => {
  await db.end()
})

async function payment(status: 'paid' | 'refunded' | 'partially_refunded' | 'disputed', refunded = 0) {
  const userId = await createUser(db)
  const { rows } = await db.query<{ id: string }>(
    `insert into public.payments (user_id, product_id, channel, stripe_session_id, stripe_charge_id, amount_total, amount_refunded, currency, method, status)
     values ($1, 'pack_s', 'stripe', 'cs_test_ack_' || gen_random_uuid()::text, 'ch_ack_' || replace(gen_random_uuid()::text, '-', ''), 990, $2, 'usd', 'card', $3)
     returning id::text`,
    [userId, refunded, status],
  )
  return rows[0].id
}

const money = async (id: string) =>
  (await db.query('select status, amount_refunded, credits_clawed_back, clawback_shortfall from public.payments where id = $1', [id])).rows[0]

const audits = async (id: string) =>
  (await db.query<{ action: string }>("select action from public.admin_audit_log where target_id = $1 and action like 'payment_%' order by id", [id])).rows.map((r) => r.action)

const counted = async (id: string) => (await loadAttentionIds(service)).includes(id)

async function openDispute(paymentId: string) {
  const dispute = `dp_ack_${randomUUID().replace(/-/g, '')}`
  await db.query(
    `insert into public.payment_disputes (stripe_dispute_id, stripe_charge_id, payment_id, amount, currency, reason, responder)
     select $1, stripe_charge_id, id, 990, 'usd', 'fraudulent', 'shotviva' from public.payments where id = $2`,
    [dispute, paymentId],
  )
  return dispute
}

describe('admin_acknowledge_payment', () => {
  it('takes a refund out of the counter, once, with one audit row and no change to money', async () => {
    const id = await payment('refunded', 990)
    const before = await money(id)
    expect(await counted(id)).toBe(true)

    const first = await acknowledgePayment(service, id, adminId)
    const second = await acknowledgePayment(service, id, adminId)
    expect(first.changed).toBe(true)
    expect(second).toEqual({ changed: false, acknowledgedAt: first.acknowledgedAt })
    expect(await counted(id)).toBe(false)
    expect(await audits(id)).toEqual(['payment_acknowledge'])
    expect(await money(id)).toEqual(before)
    const row = (await db.query('select acknowledged_by, acknowledged_status, acknowledged_refunded from public.payments where id = $1', [id])).rows[0]
    expect(row).toEqual({ acknowledged_by: adminId, acknowledged_status: 'refunded', acknowledged_refunded: 990 })
  })

  it('counts the payment again when its status or refunded amount changes after the mark', async () => {
    const id = await payment('partially_refunded', 300)
    await acknowledgePayment(service, id, adminId)
    expect(await counted(id)).toBe(false)
    await db.query("update public.payments set amount_refunded = 990, status = 'refunded' where id = $1", [id])
    expect(await counted(id)).toBe(true)
    expect((await acknowledgePayment(service, id, adminId)).changed).toBe(true)
    expect(await counted(id)).toBe(false)
  })

  it('keeps an open dispute counted while marked, until the dispute closes', async () => {
    const id = await payment('disputed')
    const dispute = await openDispute(id)
    await acknowledgePayment(service, id, adminId)
    expect(await counted(id)).toBe(true)
    await db.query("update public.payment_disputes set closed_at = now(), closed_status = 'won' where stripe_dispute_id = $1", [dispute])
    expect(await counted(id)).toBe(false)
  })

  it('撤销 brings it back, audited once; a repeat changes nothing', async () => {
    const id = await payment('disputed')
    await acknowledgePayment(service, id, adminId)
    expect((await unacknowledgePayment(service, id, adminId)).changed).toBe(true)
    expect(await unacknowledgePayment(service, id, adminId)).toEqual({ changed: false, acknowledgedAt: null })
    expect(await counted(id)).toBe(true)
    expect(await audits(id)).toEqual(['payment_acknowledge', 'payment_unacknowledge'])
  })

  it('refuses a non-admin actor, a plainly paid payment and an unknown one', async () => {
    const id = await payment('refunded', 990)
    const userId = await createUser(db)
    const call = (fn: string, args: Record<string, unknown>) => service.rpc(fn, args)
    expect((await call('admin_acknowledge_payment', { p_payment_id: Number(id), p_actor: userId })).error?.message).toBe('NOT_ADMIN')
    expect((await call('admin_unacknowledge_payment', { p_payment_id: Number(id), p_actor: userId })).error?.message).toBe('NOT_ADMIN')
    const paid = await payment('paid')
    expect((await call('admin_acknowledge_payment', { p_payment_id: Number(paid), p_actor: adminId })).error?.message).toBe('PAYMENT_NOT_FLAGGED')
    expect((await call('admin_acknowledge_payment', { p_payment_id: 9_000_000_000, p_actor: adminId })).error?.message).toBe('PAYMENT_NOT_FOUND')
    expect(await audits(id)).toEqual([])
  })

  it('is service-role only', async () => {
    for (const fn of ['admin_acknowledge_payment', 'admin_unacknowledge_payment', 'admin_attention_payment_ids']) {
      const { error } = await anonClient().rpc(fn, fn === 'admin_attention_payment_ids' ? {} : { p_payment_id: 1, p_actor: adminId })
      expect(error?.message).toMatch(/permission denied/)
    }
  })

  it('admin_todo_counts counts exactly admin_attention_payment_ids', async () => {
    await acknowledgePayment(service, await payment('refunded', 990), adminId)
    const { rows } = await db.query(
      "select (public.admin_todo_counts()->>'payment_issues')::int = cardinality(public.admin_attention_payment_ids()) as same",
    )
    expect(rows[0].same).toBe(true)
  })
})
