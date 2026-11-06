import type { Client } from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { applyStripeReplay, loadTodoCounts, previewStripeReplay, type ReplayDeps } from '@/core/admin'
import { handleStripeWebhook } from '@/core/billing/stripe'

import { connectAdmin, createUser, ledgerOf, profileOf } from './helpers'
import { checkoutSession, eventFor, mirrorOf, paymentsOf, signed, stripeHarness, subscriptionObject } from './stripe-fixtures'
import { serviceSupabase } from './supabase-env'

// T26 replay by Stripe id (ARCHITECTURE §10, AGENTS §7 test 2): replay and webhook settle once
// whichever comes first, an unpaid session is refused, a sub_ replay only touches the mirror,
// and every replay writes replay_checkout. Real local Supabase; Stripe is the fixture harness.

let db: Client
let h: ReturnType<typeof stripeHarness>
let deps: ReplayDeps
const service = serviceSupabase()

const auditOf = async (userId: string) =>
  (await db.query<{ action: string; target_id: string }>('select action, target_id from public.admin_audit_log where user_id = $1 order by id', [userId])).rows

function stage(session: ReturnType<typeof checkoutSession>) {
  h.sessions.set(session.id, session)
  return session
}

const deliver = (sessionId: string) => handleStripeWebhook(h.deps, signed(eventFor('checkout.session.completed', sessionId)))

beforeAll(async () => {
  db = await connectAdmin()
})

afterAll(async () => {
  await db.end()
})

beforeEach(() => {
  h = stripeHarness()
  deps = { ...h.deps, admin: service }
})

describe('checkout replay', () => {
  it('previews, then settles once; the webhook arriving later grants nothing', async () => {
    const userId = await createUser(db)
    const session = stage(checkoutSession({ userId, productId: 'pack_s', method: 'card' }))
    expect(await previewStripeReplay(deps, session.id)).toMatchObject({ kind: 'checkout', userId, productId: 'pack_s', credits: 20, settled: false })
    expect(await ledgerOf(db, userId)).toEqual([])
    expect((await applyStripeReplay(deps, session.id)).outcome).toBe('applied')
    expect((await deliver(session.id)).status).toBe(200)
    expect((await applyStripeReplay(deps, session.id)).outcome).toBe('replayed')
    expect((await profileOf(db, userId)).credits).toBe(20)
    expect(await paymentsOf(db, userId)).toHaveLength(1)
    expect(await previewStripeReplay(deps, session.id)).toMatchObject({ settled: true })
    expect(await auditOf(userId)).toEqual([
      { action: 'replay_checkout', target_id: session.id },
      { action: 'replay_checkout', target_id: session.id },
    ])
  })

  it('after the webhook settled, a replay is a no-op', async () => {
    const userId = await createUser(db)
    const session = stage(checkoutSession({ userId, productId: 'pack_m', method: 'card' }))
    await deliver(session.id)
    expect((await applyStripeReplay(deps, session.id)).outcome).toBe('replayed')
    expect((await profileOf(db, userId)).credits).toBe(55)
    expect((await ledgerOf(db, userId)).filter((row) => row.kind === 'purchase')).toHaveLength(1)
  })

  it('refuses an unpaid session and writes nothing', async () => {
    const userId = await createUser(db)
    const session = stage(checkoutSession({ userId, productId: 'pack_s', method: 'alipay', paymentStatus: 'unpaid' }))
    await expect(previewStripeReplay(deps, session.id)).rejects.toMatchObject({ code: 'CONFLICT' })
    await expect(applyStripeReplay(deps, session.id)).rejects.toMatchObject({ code: 'CONFLICT' })
    expect(await ledgerOf(db, userId)).toEqual([])
    expect(await auditOf(userId)).toEqual([])
  })

  it('refuses ids that are not cs_ or sub_, and a tampered price', async () => {
    await expect(previewStripeReplay(deps, 'in_123456789')).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    const userId = await createUser(db)
    const session = stage(checkoutSession({ userId, productId: 'pack_l', method: 'card', priceProductId: 'pack_s' }))
    await expect(applyStripeReplay(deps, session.id)).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    expect(await ledgerOf(db, userId)).toEqual([])
  })
})

describe('subscription replay', () => {
  it('only updates the mirror row: no credits, no paid_until', async () => {
    const userId = await createUser(db)
    const subscription = subscriptionObject({ periodEndDays: 30, userId, productId: 'starter_monthly' })
    h.subscriptions.set(subscription.id, subscription)
    const session = stage(checkoutSession({ userId, productId: 'starter_monthly', method: 'card', subscription }))
    await deliver(session.id)
    const before = await profileOf(db, userId)
    h.subscriptions.set(subscription.id, { ...subscription, cancel_at_period_end: true })
    expect(await previewStripeReplay(deps, subscription.id)).toMatchObject({ kind: 'subscription', mirrored: true, cancelAtPeriodEnd: true })
    expect((await applyStripeReplay(deps, subscription.id)).outcome).toBe('synced')
    expect((await mirrorOf(db, userId))[0]).toMatchObject({ cancel_at_period_end: true })
    expect(await profileOf(db, userId)).toEqual(before)
    expect((await auditOf(userId)).map((row) => row.target_id)).toEqual([subscription.id])
  })

  it('changes nothing for a subscription whose first payment never settled', async () => {
    const userId = await createUser(db)
    const subscription = subscriptionObject({ periodEndDays: 30, userId, productId: 'pro_monthly' })
    h.subscriptions.set(subscription.id, subscription)
    expect(await previewStripeReplay(deps, subscription.id)).toMatchObject({ mirrored: false })
    expect((await applyStripeReplay(deps, subscription.id)).outcome).toBe('unknown')
    expect(await mirrorOf(db, userId)).toEqual([])
  })
})

describe('admin_todo_counts', () => {
  it('counts stuck jobs, failures and payment issues from their indexes', async () => {
    const counts = await loadTodoCounts(service)
    expect(counts).toMatchObject({
      stuckJobs: expect.any(Number),
      failures1h: { total: expect.any(Number), failed: expect.any(Number) },
      failures24h: { total: expect.any(Number), failed: expect.any(Number) },
      pendingRequests: expect.any(Number),
      paymentIssues: expect.any(Number),
    })
    // A disputed payment shows up (other files may add their own in parallel).
    const userId = await createUser(db)
    await db.query(
      `insert into public.payments (user_id, product_id, channel, stripe_session_id, amount_total, currency, method, status)
       values ($1, 'pack_s', 'stripe', 'cs_test_todo_' || gen_random_uuid()::text, 990, 'usd', 'card', 'disputed')`,
      [userId],
    )
    expect((await loadTodoCounts(service)).paymentIssues).toBeGreaterThanOrEqual(counts.paymentIssues + 1)
  })

  it('is service-role only', async () => {
    const { anonSupabase } = await import('./supabase-env')
    const { error } = await anonSupabase().rpc('admin_todo_counts')
    expect(error?.message).toMatch(/permission denied/)
  })
})
