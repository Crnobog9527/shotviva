import { randomUUID } from 'node:crypto'

import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { banUser } from '@/core/admin'
import { signupGiftRefused } from '@/core/auth'
import { billingGrant, grantSignupCredits } from '@/core/auth/free-credits'
import { recordSignupIp } from '@/core/auth/signup-ip'
import { applyPurchase } from '@/core/billing'
import { site } from '@/site/site.config'

import { connectAdmin, createUser, ledgerOf, profileOf } from './helpers'
import { linkedUser, linkRow } from './partner-fixtures'
import { serviceSupabase } from './supabase-env'

// T25 / ARCHITECTURE §7: the same-IP rule on the signup gift (grant_credits, 0184) and the ban
// scope (admin_ban_user disconnects Graylum, 0185). The checkout 403 is a route unit test.

let db: Client
const service = serviceSupabase()
const FREE = site.billing.freeCredits
const grant = (id: string) => grantSignupCredits(billingGrant(service), id, FREE)
const freshIp = () => `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250) + 1}`

// A first verified sign-in from `ip`, as onVerifiedSignIn runs it.
async function signUp(ip: string, createdAgoHours = 0) {
  const id = await createUser(db)
  if (createdAgoHours) await db.query(`update public.profiles set created_at = now() - make_interval(hours => $2) where id = $1`, [id, createdAgoHours])
  expect(await recordSignupIp(service, id, ip)).toBe(true)
  return { id, granted: await grant(id) }
}

const backdateGift = (id: string, hours: number) =>
  db.query(`update public.credit_ledger set created_at = now() - make_interval(hours => $2) where idempotency_key = $1`, [`signup:${id}`, hours])

beforeAll(async () => {
  db = await connectAdmin()
})

afterAll(async () => {
  await db.end()
})

describe('same-IP signup gift', () => {
  it('gives the second account on an IP within 24 hours nothing, and it can still pay', async () => {
    const ip = freshIp()
    const first = await signUp(ip)
    const second = await signUp(ip)
    expect([first.granted, second.granted]).toEqual([true, false])
    expect((await profileOf(db, first.id)).free_credits).toBe(FREE)
    expect((await profileOf(db, second.id)).free_credits).toBe(0)
    expect(await ledgerOf(db, second.id)).toEqual([])
    expect(await signupGiftRefused(service, second.id, FREE)).toBe(true)
    expect(await signupGiftRefused(service, first.id, FREE)).toBe(false)
    await applyPurchase(service, { userId: second.id, productId: 'pack_s', eventId: `cs_test_${randomUUID()}` })
    expect((await profileOf(db, second.id)).credits).toBe(20)
  })

  it('never pays the refused account later: the window is anchored on its signup', async () => {
    const ip = freshIp()
    const first = await signUp(ip)
    const second = await signUp(ip)
    expect(second.granted).toBe(false)
    // A day and a half later the refused account signs in again: still nothing.
    await backdateGift(first.id, 36)
    await db.query(`update public.profiles set created_at = now() - interval '36 hours' where id = $1`, [second.id])
    expect(await grant(second.id)).toBe(false)
    expect((await profileOf(db, second.id)).free_credits).toBe(0)
  })

  it('gives the gift again once the earlier one is more than 24 hours older than the signup', async () => {
    const ip = freshIp()
    const first = await signUp(ip)
    await backdateGift(first.id, 25)
    expect((await signUp(ip)).granted).toBe(true)
  })

  it('settles two accounts verifying at once with exactly one gift', async () => {
    const ip = freshIp()
    const ids = [await createUser(db), await createUser(db), await createUser(db)]
    await Promise.all(ids.map((id) => recordSignupIp(service, id, ip)))
    const results = await Promise.all(ids.map((id) => grant(id)))
    expect(results.filter(Boolean)).toHaveLength(1)
  })

  it('leaves accounts without a recorded IP and other grants alone', async () => {
    const noIp = await createUser(db)
    expect(await grant(noIp)).toBe(true)
    const ip = freshIp()
    await signUp(ip)
    const refused = await signUp(ip)
    // An activity grant (a different key) is not a signup gift.
    await billingGrant(service)({ userId: refused.id, amount: 2, reason: 'promo', idempotencyKey: `promo:${refused.id}`, pool: 'free' })
    expect((await profileOf(db, refused.id)).free_credits).toBe(2)
  })
})

describe('ban scope', () => {
  it('disconnects Graylum in the same call', async () => {
    const user = await linkedUser(db)
    expect((await linkRow(db, user))?.revoked_at).toBeNull()
    await banUser(service, { userId: user, reason: 'abuse' })
    const row = await linkRow(db, user)
    expect(row?.revoked_at).toBeInstanceOf(Date)
    expect(row?.link_code).toBeNull()
    expect((await profileOf(db, user)).banned_at).toBeInstanceOf(Date)
  })

  it('bans an account that never connected Graylum', async () => {
    const user = await createUser(db)
    await banUser(service, { userId: user, reason: 'abuse' })
    expect(await linkRow(db, user)).toBeNull()
  })
})
