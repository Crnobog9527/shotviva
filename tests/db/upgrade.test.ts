import { randomUUID } from 'node:crypto'

import type { Client } from 'pg'
import type Stripe from 'stripe'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { applyPurchase, currentTier } from '@/core/billing'
import { handleStripeWebhook } from '@/core/billing/stripe'
import { cancelOtherSubscriptions } from '@/core/billing/subscription'
import type { ProductId } from '@/core/config'

import { connectAdmin, createUser, DAY_MS, profileOf, setBalances } from './helpers'
import { checkoutSession, eventFor, mirrorOf, signed, stripeHarness, subscriptionObject } from './stripe-fixtures'
import { serviceSupabase } from './supabase-env'

// Membership upgrades (ARCHITECTURE §6.2 「升级」, Owner 2026-11-07, T66), against real local
// Supabase: apply_purchase grants the higher plan in full at once and runs paid_until from the
// payment (0480); the Stripe webhook then cancels the old subscription and mirrors it.

const service = serviceSupabase()
let db: Client

beforeAll(async () => {
  db = await connectAdmin()
})

afterAll(async () => {
  await db.end()
})

const daysFromNow = (date: Date | null) => ((date?.getTime() ?? 0) - Date.now()) / DAY_MS
const buy = (userId: string, productId: ProductId, eventId = `cs_${randomUUID()}`) => applyPurchase(service, { userId, productId, eventId })

describe('apply_purchase on an upgrade (0480)', () => {
  it('Starter monthly → Pro monthly: both grants kept, paid_until from the payment (+30, not +60)', async () => {
    const userId = await createUser(db)
    await buy(userId, 'starter_monthly')
    const eventId = `cs_${randomUUID()}`
    const upgrade = await buy(userId, 'pro_monthly', eventId)
    expect(upgrade).toMatchObject({ applied: true, credits: 50 + 135 })
    expect(daysFromNow(upgrade.paidUntil)).toBeCloseTo(30, 2)
    expect(await currentTier(service, userId)).toBe('pro')
    const { rows } = await db.query('select paid_until_after from public.credit_ledger where idempotency_key = $1', [`purchase:${eventId}`])
    expect(rows[0]?.paid_until_after?.getTime()).toBe(upgrade.paidUntil?.getTime())
  })

  it('a longer old window is kept: Starter yearly → Pro monthly leaves paid_until at about +365', async () => {
    const userId = await createUser(db)
    await buy(userId, 'starter_yearly')
    const upgrade = await buy(userId, 'pro_monthly')
    expect(upgrade.credits).toBe(600 + 135)
    expect(daysFromNow(upgrade.paidUntil)).toBeCloseTo(365, 2)
  })

  it('Pro monthly → Pro yearly runs a year from the payment', async () => {
    const userId = await createUser(db)
    await buy(userId, 'pro_monthly')
    const upgrade = await buy(userId, 'pro_yearly')
    expect(upgrade.credits).toBe(135 + 1620)
    expect(daysFromNow(upgrade.paidUntil)).toBeCloseTo(365, 2)
  })

  it('a replayed upgrade grants nothing and moves nothing', async () => {
    const userId = await createUser(db)
    await buy(userId, 'starter_monthly')
    const eventId = `cs_${randomUUID()}`
    const first = await buy(userId, 'max_monthly', eventId)
    const again = await buy(userId, 'max_monthly', eventId)
    expect(again).toMatchObject({ applied: false, credits: first.credits })
    expect(again.paidUntil?.getTime()).toBe(first.paidUntil?.getTime())
  })

  it('unchanged otherwise: the same plan stacks, an expired window restarts, a lower plan stacks', async () => {
    const same = await createUser(db)
    await buy(same, 'starter_monthly')
    expect(daysFromNow((await buy(same, 'starter_monthly')).paidUntil)).toBeCloseTo(60, 2)

    const expired = await createUser(db)
    await buy(expired, 'starter_monthly')
    await setBalances(db, expired, { credits: 50, paidUntil: new Date(Date.now() - 5 * DAY_MS) })
    expect(daysFromNow((await buy(expired, 'pro_monthly')).paidUntil)).toBeCloseTo(30, 2)

    // Checkout refuses this (409); should one reach the database it is not an upgrade.
    const lower = await createUser(db)
    await buy(lower, 'pro_monthly')
    expect(daysFromNow((await buy(lower, 'starter_monthly')).paidUntil)).toBeCloseTo(60, 2)
  })
})

describe('Stripe webhook: an upgrade cancels the old subscription (T66)', () => {
  let h: ReturnType<typeof stripeHarness>
  let cancel: ReturnType<typeof vi.fn>

  beforeEach(() => {
    h = stripeHarness()
    cancel = h.stripe.subscriptions.cancel as unknown as ReturnType<typeof vi.fn>
    h.deps.cancelOthers = (userId, keep) =>
      cancelOtherSubscriptions(
        {
          admin: serviceSupabase(),
          stripe: () => h.stripe,
          waffo: () => {
            throw new Error('no Waffo in this test')
          },
        },
        userId,
        keep,
      )
  })

  async function subscribe(userId: string, productId: ProductId, method: 'card' | 'cn_card' = 'card') {
    const subscription = subscriptionObject({ periodEndDays: 30, userId, productId, method })
    h.subscriptions.set(subscription.id, subscription)
    const session = checkoutSession({ userId, productId, method, subscription })
    h.sessions.set(session.id, session)
    const result = await handleStripeWebhook(h.deps, signed(eventFor('checkout.session.completed', session.id)))
    return { subscription, result }
  }

  it.each(['card', 'cn_card'] as const)('Starter monthly → Pro monthly (%s): Pro at once, Starter cancelled now and mirrored', async (method) => {
    const userId = await createUser(db)
    const { subscription: old } = await subscribe(userId, 'starter_monthly', method)
    cancel.mockImplementation(async (id: string) => ({ ...structuredClone(h.subscriptions.get(id)), status: 'canceled' }) as Stripe.Subscription)

    const { subscription: upgraded, result } = await subscribe(userId, 'pro_monthly', method)

    expect(result).toMatchObject({ status: 200, body: { outcome: 'applied' } })
    expect(cancel).toHaveBeenCalledOnce()
    expect(cancel).toHaveBeenCalledWith(old.id, { prorate: false, invoice_now: false })
    const profile = await profileOf(db, userId)
    expect(profile.credits).toBe(50 + 135)
    expect(daysFromNow(profile.paid_until)).toBeCloseTo(30, 2)
    const mirror = await mirrorOf(db, userId)
    expect(mirror.find((row) => row.stripe_subscription_id === old.id)?.status).toBe('canceled')
    expect(mirror.find((row) => row.stripe_subscription_id === upgraded.id)).toMatchObject({ product_id: 'pro_monthly', status: 'active' })
  })

  it('a failed cancel keeps the new plan and the webhook still answers 200', async () => {
    const userId = await createUser(db)
    const { subscription: old } = await subscribe(userId, 'starter_monthly')
    cancel.mockRejectedValue(Object.assign(new Error('Stripe is down'), { statusCode: 500 }))

    const { result } = await subscribe(userId, 'max_yearly')

    expect(result).toMatchObject({ status: 200, body: { outcome: 'applied' } })
    expect((await profileOf(db, userId)).credits).toBe(50 + 3360)
    expect(await currentTier(service, userId)).toBe('max')
    // Left for the Owner (Sentry alert): the old row still says active.
    expect((await mirrorOf(db, userId)).find((row) => row.stripe_subscription_id === old.id)?.status).toBe('active')
  })

  it('a pack bought by a member cancels nothing', async () => {
    const userId = await createUser(db)
    await subscribe(userId, 'starter_monthly')
    const session = checkoutSession({ userId, productId: 'pack_m', method: 'card' })
    h.sessions.set(session.id, session)
    await handleStripeWebhook(h.deps, signed(eventFor('checkout.session.completed', session.id)))
    expect(cancel).not.toHaveBeenCalled()
  })
})
