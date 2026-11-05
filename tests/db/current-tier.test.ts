import { randomUUID } from 'node:crypto'

import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { adminAdjustCredits, applyPurchase, currentTier } from '@/core/billing'
import type { ProductId } from '@/core/config'
import { concurrencyLimit } from '@/core/jobs'

import { connectAdmin, createUser, DAY_MS, serviceClient, setBalances } from './helpers'

// current_tier(user_id), ARCHITECTURE §6.2 "会员档位权益": the latest membership purchase while
// paid_until > now(); packs, admin adjustments and an expired window give no tier.

const service = serviceClient()
let db: Client

beforeAll(async () => {
  db = await connectAdmin()
})

afterAll(async () => {
  await db.end()
})

const buy = (userId: string, productId: ProductId) => applyPurchase(service, { userId, productId, eventId: `cs_${randomUUID()}` })

describe('current_tier', () => {
  it('is null for an account that never paid', async () => {
    expect(await currentTier(service, await createUser(db))).toBeNull()
  })

  it.each([
    ['starter_monthly', 'starter'],
    ['starter_yearly', 'starter'],
    ['pro_monthly', 'pro'],
    ['pro_yearly', 'pro'],
    ['max_monthly', 'max'],
    ['max_yearly', 'max'],
  ] as const)('%s gives %s', async (productId, tier) => {
    const userId = await createUser(db)
    await buy(userId, productId)
    expect(await currentTier(service, userId)).toBe(tier)
  })

  it('is null when only packs were bought', async () => {
    const userId = await createUser(db)
    await buy(userId, 'pack_l')
    expect(await currentTier(service, userId)).toBeNull()
  })

  it('a pack after a membership keeps the membership tier', async () => {
    const userId = await createUser(db)
    await buy(userId, 'pro_monthly')
    await buy(userId, 'pack_s')
    expect(await currentTier(service, userId)).toBe('pro')
  })

  it('the most recent membership purchase wins', async () => {
    const userId = await createUser(db)
    await buy(userId, 'max_yearly')
    await buy(userId, 'starter_monthly')
    expect(await currentTier(service, userId)).toBe('starter')
  })

  it('admin compensation does not change the tier', async () => {
    const userId = await createUser(db)
    await buy(userId, 'max_monthly')
    await adminAdjustCredits(service, { userId, amount: 10, reason: 'compensation', pool: 'paid' })
    expect(await currentTier(service, userId)).toBe('max')
  })

  it('is null once paid_until has passed, even with paid credits left', async () => {
    const userId = await createUser(db)
    await buy(userId, 'pro_monthly')
    await setBalances(db, userId, { credits: 135, paidUntil: new Date(Date.now() - DAY_MS) })
    expect(await currentTier(service, userId)).toBeNull()
  })

  it('is null when paid_until is set but no membership was ever bought', async () => {
    const userId = await createUser(db, { paidUntil: new Date(Date.now() + 10 * DAY_MS) })
    expect(await currentTier(service, userId)).toBeNull()
  })

  it('is null for an unknown user', async () => {
    expect(await currentTier(service, randomUUID())).toBeNull()
  })
})

describe('concurrencyLimit follows current_tier (1 / 3 / 6, none = 1)', () => {
  it.each([
    [null, 1],
    ['pack_s', 1],
    ['starter_yearly', 1],
    ['pro_monthly', 3],
    ['max_yearly', 6],
  ] as const)('after %s: %i at once', async (productId, limit) => {
    const userId = await createUser(db)
    if (productId) await buy(userId, productId)
    expect(await concurrencyLimit(service, userId)).toBe(limit)
  })

  it('drops back to 1 when the membership expires', async () => {
    const userId = await createUser(db)
    await buy(userId, 'max_monthly')
    await setBalances(db, userId, { credits: 280, paidUntil: new Date(Date.now() - DAY_MS) })
    expect(await concurrencyLimit(service, userId)).toBe(1)
  })
})
