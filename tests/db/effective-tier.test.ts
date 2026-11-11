import { randomUUID } from 'node:crypto'

import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { z } from 'zod'

import { applyPurchase, callRpc, currentTier, effectiveTier, TIER_LIMITS } from '@/core/billing'
import { accountLimits } from '@/core/jobs'

import { connectAdmin, createUser, serviceClient } from './helpers'
import { serviceSupabase } from './supabase-env'

// effective_tier(user_id): Max for an unbanned admin whatever the plan, current_tier() for
// everyone else. Feature gates read it; billing keeps reading current_tier().

const service = serviceClient()
let db: Client

beforeAll(async () => {
  db = await connectAdmin()
})

afterAll(async () => {
  await db.end()
})

type Plan = 'starter_monthly' | 'pro_monthly' | 'max_monthly'

async function account({ plan, admin = false, banned = false }: { plan?: Plan; admin?: boolean; banned?: boolean } = {}) {
  const userId = await createUser(db)
  if (plan) await applyPurchase(service, { userId, productId: plan, eventId: `cs_${randomUUID()}` })
  if (admin) await db.query("update public.profiles set role = 'admin' where id = $1", [userId])
  if (banned) await db.query('update public.profiles set banned_at = now() where id = $1', [userId])
  return userId
}

const claimZip = (userId: string) =>
  callRpc(serviceSupabase(), 'claim_batch_zip', { p_user_id: userId, p_batch_id: randomUUID(), p_token: randomUUID() }, z.string())

describe('effective_tier', () => {
  it.each([
    [undefined, null],
    ['starter_monthly', 'starter'],
    ['pro_monthly', 'pro'],
    ['max_monthly', 'max'],
  ] as const)('is current_tier for a non-admin (%s → %s)', async (plan, tier) => {
    const userId = await account({ plan })
    expect(await effectiveTier(service, userId)).toBe(tier)
    expect(await currentTier(service, userId)).toBe(tier)
    expect(await accountLimits(service, userId)).toEqual(TIER_LIMITS[tier ?? 'starter'])
  })

  it.each([undefined, 'starter_monthly', 'pro_monthly'] as const)('is Max for an unbanned admin on %s, billing tier unchanged', async (plan) => {
    const userId = await account({ plan, admin: true })
    expect(await effectiveTier(service, userId)).toBe('max')
    expect(await accountLimits(service, userId)).toEqual(TIER_LIMITS.max)
    // Pack member rates, upgrade rules and the membership card still read the real tier.
    expect(await currentTier(service, userId)).toBe(plan ? plan.replace('_monthly', '') : null)
  })

  it('gives a banned admin nothing special', async () => {
    const free = await account({ admin: true, banned: true })
    expect(await effectiveTier(service, free)).toBeNull()
    expect(await accountLimits(service, free)).toEqual(TIER_LIMITS.starter)
    const pro = await account({ plan: 'pro_monthly', admin: true, banned: true })
    expect(await effectiveTier(service, pro)).toBe('pro')
  })

  it('is not callable by the client roles', async () => {
    for (const role of ['anon', 'authenticated']) {
      const { rows } = await db.query('select has_function_privilege($1, $2, $3) as ok', [role, 'public.effective_tier(uuid)', 'execute'])
      expect(rows[0].ok).toBe(false)
    }
  })
})

describe('claim_batch_zip reads effective_tier', () => {
  it('lets an admin without a plan download batch ZIPs', async () => {
    expect(await claimZip(await account({ admin: true }))).toBe('acquired')
  })

  it('still asks Starter, free and banned admins to upgrade', async () => {
    expect(await claimZip(await account())).toBe('upgrade')
    expect(await claimZip(await account({ plan: 'starter_monthly' }))).toBe('upgrade')
    expect(await claimZip(await account({ admin: true, banned: true }))).toBe('upgrade')
  })
})
