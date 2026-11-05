import { randomUUID } from 'node:crypto'

import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { adminAdjustCredits, applyPurchase, grantCredits, signupGrantKey } from '@/core/billing'

import { site } from '@/site/site.config'

import { connectAdmin, createUser, DAY_MS, ledgerOf, profileOf, serviceClient } from './helpers'

const service = serviceClient()
let db: Client

beforeAll(async () => {
  db = await connectAdmin()
})

afterAll(async () => {
  await db.end()
})

describe('profiles copy (T1 owns it)', () => {
  it('creates a profile with both pools empty and no membership', async () => {
    const id = await createUser(db)
    const profile = await profileOf(db, id)
    expect(profile).toMatchObject({ credits: 0, free_credits: 0, paid_until: null })
  })
})

describe('grant_credits', () => {
  it('grants the signup bonus into the free pool once per idempotency key', async () => {
    const userId = await createUser(db)
    const amount = site.billing.freeCredits
    const input = { userId, amount, reason: 'signup bonus', idempotencyKey: signupGrantKey(userId), pool: 'free' as const }

    const first = await grantCredits(service, input)
    const second = await grantCredits(service, input)

    expect(first).toMatchObject({ applied: true, credits: 0, freeCredits: amount })
    expect(second).toMatchObject({ applied: false, credits: 0, freeCredits: amount })
    expect(await ledgerOf(db, userId)).toEqual([
      { kind: 'grant', pool: 'free', delta: amount, idempotency_key: `signup:${userId}` },
    ])
  })

  it('can grant into the paid pool', async () => {
    const userId = await createUser(db, { freeCredits: 1 })
    const result = await grantCredits(service, { userId, amount: 5, reason: 'promo', idempotencyKey: randomUUID(), pool: 'paid' })
    expect(result).toMatchObject({ credits: 5, freeCredits: 1, paidUntil: null })
  })

  it('refuses to reuse a key for another user or another pool', async () => {
    const a = await createUser(db)
    const b = await createUser(db)
    const idempotencyKey = `promo:${randomUUID()}`
    await grantCredits(service, { userId: a, amount: 1, reason: 'promo', idempotencyKey, pool: 'free' })
    await expect(
      grantCredits(service, { userId: b, amount: 1, reason: 'promo', idempotencyKey, pool: 'free' }),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
    await expect(
      grantCredits(service, { userId: a, amount: 1, reason: 'promo', idempotencyKey, pool: 'paid' }),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
  })

  it('rejects unknown users and unknown pools', async () => {
    await expect(
      grantCredits(service, { userId: randomUUID(), amount: 1, reason: 'x', idempotencyKey: randomUUID(), pool: 'free' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    const userId = await createUser(db)
    const { error } = await service.rpc('grant_credits', {
      p_user_id: userId,
      p_amount: 1,
      p_reason: 'x',
      p_idempotency_key: randomUUID(),
      p_pool: 'gold',
    })
    expect(error?.message).toBe('INVALID_INPUT')
  })
})

describe('admin_adjust_credits', () => {
  it('adjusts either pool with a ledger row each', async () => {
    const userId = await createUser(db, { credits: 5, freeCredits: 3 })
    await adminAdjustCredits(service, { userId, amount: 4, reason: 'support', pool: 'paid' })
    await adminAdjustCredits(service, { userId, amount: -2, reason: 'gift abuse', pool: 'free' })
    const after = await adminAdjustCredits(service, { userId, amount: -6, reason: 'abuse', pool: 'paid' })
    expect(after).toMatchObject({ credits: 3, freeCredits: 1 })
    expect((await ledgerOf(db, userId)).map(({ pool, delta }) => [pool, delta])).toEqual([
      ['paid', 4],
      ['free', -2],
      ['paid', -6],
    ])
  })

  it('never drives either pool negative, even when the other could cover it', async () => {
    const userId = await createUser(db, { credits: 2, freeCredits: 10 })
    await expect(
      adminAdjustCredits(service, { userId, amount: -3, reason: 'too much', pool: 'paid' }),
    ).rejects.toMatchObject({ code: 'CREDITS_INSUFFICIENT' })
    await expect(
      adminAdjustCredits(service, { userId, amount: -11, reason: 'too much', pool: 'free' }),
    ).rejects.toMatchObject({ code: 'CREDITS_INSUFFICIENT' })
    expect(await profileOf(db, userId)).toMatchObject({ credits: 2, free_credits: 10 })
  })
})

describe('apply_purchase and paid_until', () => {
  const daysFromNow = (date: Date | null) => ((date?.getTime() ?? 0) - Date.now()) / DAY_MS

  it('applies one event id only once, into the paid pool', async () => {
    const userId = await createUser(db, { freeCredits: 3 })
    const eventId = `evt_${randomUUID()}`
    const first = await applyPurchase(service, { userId, productId: 'starter_monthly', eventId })
    const second = await applyPurchase(service, { userId, productId: 'starter_monthly', eventId })

    expect(first).toMatchObject({ applied: true, credits: 50, freeCredits: 3 })
    expect(second).toMatchObject({ applied: false, credits: 50, freeCredits: 3 })
    expect(second.paidUntil?.getTime()).toBe(first.paidUntil?.getTime())
    expect(await ledgerOf(db, userId)).toEqual([
      { kind: 'purchase', pool: 'paid', delta: 50, idempotency_key: `purchase:${eventId}` },
    ])
  })

  it('rejects the same event id for a different product or user', async () => {
    const userId = await createUser(db)
    const other = await createUser(db)
    const eventId = `evt_${randomUUID()}`
    await applyPurchase(service, { userId, productId: 'starter_monthly', eventId })
    await expect(applyPurchase(service, { userId, productId: 'pack_s', eventId })).rejects.toMatchObject({
      code: 'CONFLICT',
    })
    await expect(applyPurchase(service, { userId: other, productId: 'starter_monthly', eventId })).rejects.toMatchObject({
      code: 'CONFLICT',
    })
  })

  it('stacks consecutive memberships onto the remaining window', async () => {
    const userId = await createUser(db, { credits: 1 })
    await applyPurchase(service, { userId, productId: 'starter_monthly', eventId: `evt_${randomUUID()}` })
    const second = await applyPurchase(service, { userId, productId: 'starter_monthly', eventId: `evt_${randomUUID()}` })
    expect(second.credits).toBe(101)
    expect(daysFromNow(second.paidUntil)).toBeCloseTo(60, 2)
  })

  it('restarts the window from now when the previous one expired', async () => {
    const userId = await createUser(db, { paidUntil: new Date(Date.now() - 10 * DAY_MS) })
    const result = await applyPurchase(service, { userId, productId: 'starter_monthly', eventId: `evt_${randomUUID()}` })
    expect(daysFromNow(result.paidUntil)).toBeCloseTo(30, 2)
  })

  it('a pack (days null) adds paid credits and leaves an empty paid_until empty', async () => {
    const userId = await createUser(db)
    const result = await applyPurchase(service, { userId, productId: 'pack_s', eventId: `evt_${randomUUID()}` })
    expect(result).toMatchObject({ applied: true, credits: 20, freeCredits: 0, paidUntil: null })
    expect((await profileOf(db, userId)).paid_until).toBeNull()
    const { rows } = await db.query('select paid_until_after from public.credit_ledger where user_id = $1', [userId])
    expect(rows).toEqual([{ paid_until_after: null }])
  })

  it('a pack leaves a running membership exactly where it was', async () => {
    const paidUntil = new Date(Date.now() + 5 * DAY_MS)
    const userId = await createUser(db, { paidUntil })
    const result = await applyPurchase(service, { userId, productId: 'pack_s', eventId: `evt_${randomUUID()}` })
    expect(result.paidUntil?.getTime()).toBe(paidUntil.getTime())
  })

  it('no longer exposes is_paid', async () => {
    const { error } = await service.rpc('is_paid', { p_user_id: randomUUID() })
    expect(error).not.toBeNull()
  })

  it('reads credits and days from the products table, equal to site.config', async () => {
    const { rows } = await db.query<{ id: string; credits: number; days: number | null; price_usd: string }>(
      'select id, credits, days, price_usd from public.products order by id',
    )
    const expected = [...site.billing.products]
      .map((p) => ({ id: p.id, credits: p.credits, days: p.paidDays, price_usd: p.priceUsd.toFixed(2) }))
      .sort((a, b) => a.id.localeCompare(b.id))
    expect(rows).toEqual(expected)
  })
})
