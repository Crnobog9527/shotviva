import type { Client } from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { cancelOtherSubscriptions, readSubscriptionSummary, refuseEndedOrder } from '@/core/billing/subscription'
import { handleWaffoWebhook, type WaffoWebhookDeps } from '@/core/billing/waffo'
import { site } from '@/site/site.config'

import { WAFFO_STORE, signWaffo, subscriptionPaid, subscriptionState, waffoKeys } from '../fakes/waffo'
import { connectAdmin, createUser, profileOf } from './helpers'
import { serviceSupabase } from './supabase-env'

// T66 on Waffo, after Codex's sandbox run (2026-11-07): Waffo's cancel-order only stops an
// active order at its period end, so an upgrade marks the old order ended in our mirror at the
// upgrade time, nothing Waffo reports later can reopen it, a later charge on it grants nothing,
// and the account card describes the new plan. Real local Supabase, real signatures.

let db: Client
let deps: WaffoWebhookDeps
type Cancel = (orderId: string) => Promise<{ orderId: string; status: string; currentPeriodEnd?: string }>
let waffo: { cancelSubscription: ReturnType<typeof vi.fn<Cancel>> }
const keys = waffoKeys()

beforeAll(async () => {
  db = await connectAdmin()
})

afterAll(async () => {
  await db.end()
})

beforeEach(() => {
  const admin = serviceSupabase()
  waffo = { cancelSubscription: vi.fn<Cancel>(async (orderId) => ({ orderId, status: 'canceling', currentPeriodEnd: '2026-12-07' })) }
  deps = {
    db: admin,
    products: site.billing.products,
    publicKey: keys.publicKey,
    storeId: WAFFO_STORE,
    mode: 'test',
    trackBuy: vi.fn(),
    cancelOthers: (userId, keep) =>
      cancelOtherSubscriptions(
        {
          admin,
          stripe: () => {
            throw new Error('no Stripe in this test')
          },
          waffo: () => waffo,
        },
        userId,
        keep,
      ),
    refuseEnded: (input) => refuseEndedOrder({ admin, waffo: () => waffo }, input),
  }
})

const orderId = () => `ORD_${Math.random().toString(36).slice(2, 14)}`

function deliver(event: unknown) {
  const body = JSON.stringify(event)
  return handleWaffoWebhook(deps, { body, signature: signWaffo(body, keys.privateKey) })
}

async function mirrorOf(order: string) {
  const { rows } = await db.query('select status, current_period_end, cancel_at_period_end from public.subscriptions where waffo_order_id = $1', [order])
  return rows[0] ?? null
}

async function subscribe(userId: string, productId: 'starter_monthly' | 'pro_monthly', order: string) {
  await deliver(subscriptionPaid({ userId, productId, orderId: order }))
  await deliver(subscriptionState({ userId, productId, orderId: order, eventType: 'subscription.activated', orderStatus: 'active', currentPeriodEnd: '2026-12-07', timestamp: new Date().toISOString() }))
}

describe('Waffo upgrade Starter → Pro (T66)', () => {
  it('ends the old order in the mirror at the upgrade; Waffo’s later canceling event does not reopen it', async () => {
    const userId = await createUser(db)
    const starter = orderId()
    const pro = orderId()
    await subscribe(userId, 'starter_monthly', starter)
    const before = Date.now()
    await subscribe(userId, 'pro_monthly', pro)

    expect(waffo.cancelSubscription).toHaveBeenCalledWith(starter)
    const old = await mirrorOf(starter)
    expect(old).toMatchObject({ status: 'canceled', cancel_at_period_end: false })
    expect(old.current_period_end.getTime()).toBeGreaterThanOrEqual(before - 1000)
    expect(old.current_period_end.getTime()).toBeLessThanOrEqual(Date.now() + 1000)

    await deliver(subscriptionState({ userId, productId: 'starter_monthly', orderId: starter, eventType: 'subscription.canceling', orderStatus: 'canceling', currentPeriodEnd: '2026-12-07' }))
    expect(await mirrorOf(starter)).toMatchObject({ status: 'canceled' })
    expect(await mirrorOf(pro)).toMatchObject({ status: 'active', cancel_at_period_end: false })
    expect((await profileOf(db, userId)).credits).toBe(50 + 135)
  })

  it('a later charge on the old order grants nothing and cancels it again', async () => {
    const userId = await createUser(db)
    const starter = orderId()
    await subscribe(userId, 'starter_monthly', starter)
    await subscribe(userId, 'pro_monthly', orderId())
    waffo.cancelSubscription.mockClear()

    const renewal = subscriptionPaid({ userId, productId: 'starter_monthly', orderId: starter, periodNumber: 2 })
    const result = await deliver({ ...renewal, timestamp: new Date(Date.now() + 60_000).toISOString() })

    expect(result).toMatchObject({ status: 200, body: { outcome: 'ended' } })
    expect((await profileOf(db, userId)).credits).toBe(50 + 135)
    expect(waffo.cancelSubscription).toHaveBeenCalledWith(starter)
  })

  it('after the member cancels Pro, the account card says Pro cancels, not Starter (Codex)', async () => {
    const userId = await createUser(db)
    const starter = orderId()
    const pro = orderId()
    await subscribe(userId, 'starter_monthly', starter)
    await subscribe(userId, 'pro_monthly', pro)
    await deliver(subscriptionState({ userId, productId: 'pro_monthly', orderId: pro, eventType: 'subscription.canceling', orderStatus: 'canceling', currentPeriodEnd: '2026-12-07', timestamp: new Date(Date.now() + 1000).toISOString() }))

    const summary = await readSubscriptionSummary(serviceSupabase(), userId, site.billing.products)
    expect(summary).toMatchObject({ kind: 'subscription', provider: 'waffo', tier: 'pro', interval: 'month', state: 'cancels' })
  })
})
