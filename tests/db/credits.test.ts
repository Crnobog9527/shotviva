import { randomUUID } from 'node:crypto'

import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { adminAdjustCredits, applyPurchase, grantCredits, isPaid, signupGrantKey } from '@/core/billing'

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
  it('creates a zero-credit, unpaid profile when an auth user is inserted', async () => {
    const id = await createUser(db)
    const profile = await profileOf(db, id)
    expect(profile.credits).toBe(0)
    expect(profile.paid_until).toBeNull()
  })
})

describe('grant_credits', () => {
  it('grants the signup bonus once per idempotency key', async () => {
    const userId = await createUser(db)
    const input = { userId, amount: 3, reason: 'signup bonus', idempotencyKey: signupGrantKey(userId) }

    const first = await grantCredits(service, input)
    const second = await grantCredits(service, input)

    expect(first).toMatchObject({ applied: true, balance: 3 })
    expect(second).toMatchObject({ applied: false, balance: 3 })
    expect(await ledgerOf(db, userId)).toEqual([
      { kind: 'grant', delta: 3, idempotency_key: `signup:${userId}` },
    ])
  })

  it('refuses to reuse a key for another user', async () => {
    const a = await createUser(db)
    const b = await createUser(db)
    const idempotencyKey = `promo:${randomUUID()}`
    await grantCredits(service, { userId: a, amount: 1, reason: 'promo', idempotencyKey })
    await expect(
      grantCredits(service, { userId: b, amount: 1, reason: 'promo', idempotencyKey }),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
  })

  it('rejects unknown users', async () => {
    await expect(
      grantCredits(service, { userId: randomUUID(), amount: 1, reason: 'x', idempotencyKey: randomUUID() }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
})

describe('admin_adjust_credits', () => {
  it('adds and removes credits with a ledger row each', async () => {
    const userId = await createUser(db, { credits: 5 })
    await adminAdjustCredits(service, { userId, amount: 4, reason: 'support' })
    const after = await adminAdjustCredits(service, { userId, amount: -6, reason: 'abuse' })
    expect(after.balance).toBe(3)
    expect((await ledgerOf(db, userId)).map((row) => row.delta)).toEqual([4, -6])
  })

  it('never drives the balance negative', async () => {
    const userId = await createUser(db, { credits: 2 })
    await expect(
      adminAdjustCredits(service, { userId, amount: -3, reason: 'too much' }),
    ).rejects.toMatchObject({ code: 'CREDITS_INSUFFICIENT' })
    expect((await profileOf(db, userId)).credits).toBe(2)
  })
})

describe('apply_purchase and paid_until', () => {
  const daysFromNow = (date: Date | null) => ((date?.getTime() ?? 0) - Date.now()) / DAY_MS

  it('applies one event id only once', async () => {
    const userId = await createUser(db)
    const eventId = `evt_${randomUUID()}`
    const first = await applyPurchase(service, { userId, productId: 'pass', eventId })
    const second = await applyPurchase(service, { userId, productId: 'pass', eventId })

    expect(first).toMatchObject({ applied: true, balance: 30 })
    expect(second).toMatchObject({ applied: false, balance: 30 })
    expect(second.paidUntil?.getTime()).toBe(first.paidUntil?.getTime())
    expect(await ledgerOf(db, userId)).toHaveLength(1)
  })

  it('rejects the same event id for a different product or user', async () => {
    const userId = await createUser(db)
    const other = await createUser(db)
    const eventId = `evt_${randomUUID()}`
    await applyPurchase(service, { userId, productId: 'pass', eventId })
    await expect(applyPurchase(service, { userId, productId: 'pack', eventId })).rejects.toMatchObject({
      code: 'CONFLICT',
    })
    await expect(applyPurchase(service, { userId: other, productId: 'pass', eventId })).rejects.toMatchObject({
      code: 'CONFLICT',
    })
  })

  it('stacks consecutive purchases onto the remaining window', async () => {
    const userId = await createUser(db, { credits: 1 })
    await applyPurchase(service, { userId, productId: 'pass', eventId: `evt_${randomUUID()}` })
    const second = await applyPurchase(service, { userId, productId: 'pass', eventId: `evt_${randomUUID()}` })
    const third = await applyPurchase(service, { userId, productId: 'pack', eventId: `evt_${randomUUID()}` })

    expect(second.balance).toBe(61)
    expect(daysFromNow(second.paidUntil)).toBeCloseTo(60, 2)
    expect(third.balance).toBe(181)
    expect(daysFromNow(third.paidUntil)).toBeCloseTo(425, 2)
  })

  it('restarts the window from now when the previous one expired', async () => {
    const userId = await createUser(db, { paidUntil: new Date(Date.now() - 10 * DAY_MS) })
    const result = await applyPurchase(service, { userId, productId: 'pass', eventId: `evt_${randomUUID()}` })
    expect(daysFromNow(result.paidUntil)).toBeCloseTo(30, 2)
  })

  it('is_paid follows paid_until and turns false after expiry', async () => {
    const userId = await createUser(db)
    expect(await isPaid(service, userId)).toBe(false)

    await applyPurchase(service, { userId, productId: 'pass', eventId: `evt_${randomUUID()}` })
    expect(await isPaid(service, userId)).toBe(true)

    await db.query("update public.profiles set paid_until = now() - interval '1 second' where id = $1", [userId])
    expect(await isPaid(service, userId)).toBe(false)
    // Credits never expire, only the paid window does.
    expect((await profileOf(db, userId)).credits).toBe(30)
  })

  it('treats unknown users as not paid', async () => {
    expect(await isPaid(service, randomUUID())).toBe(false)
  })

  it('reads credits and days from the products table', async () => {
    const { rows } = await db.query('select id, credits, days, price_usd from public.products order by id')
    expect(rows).toEqual([
      { id: 'pack', credits: 120, days: 365, price_usd: '0.00' },
      { id: 'pass', credits: 30, days: 30, price_usd: '0.00' },
    ])
  })
})
