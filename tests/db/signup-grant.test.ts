import { createClient } from '@supabase/supabase-js'
import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { billingGrant, grantSignupCredits } from '@/core/auth/free-credits'
import { recordSignupIp } from '@/core/auth/signup-ip'
import { site } from '@/site/site.config'

import { connectAdmin, createUser, ledgerOf, localSupabase, profileOf } from './helpers'

// T1's first-sign-in path against the real grant_credits (no mock): the bonus lands in the
// free pool, never in paid credits.
const { apiUrl, serviceRoleKey } = localSupabase()
// The signup gift is site.billing.freeCredits (6 = "3 free Standard images", 建站规格 G3).
const FREE = site.billing.freeCredits
const admin = createClient(apiUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })

describe('signup credit grant (T1 -> T2 grant_credits)', () => {
  let db: Client

  beforeAll(async () => {
    db = await connectAdmin()
  })

  afterAll(async () => {
    await db.end()
  })

  it('grants the free credits once, however many verified sign-ins follow', async () => {
    const id = await createUser(db)
    const firsts: boolean[] = []
    for (let i = 0; i < 3; i += 1) firsts.push(await grantSignupCredits(billingGrant(admin), id, FREE))
    // Only the first reports applied, which is what fires the one `signup` event (T18).
    expect(firsts).toEqual([true, false, false])
    expect(await profileOf(db, id)).toMatchObject({ credits: 0, free_credits: FREE })
    expect(await ledgerOf(db, id)).toEqual([{ kind: 'grant', pool: 'free', delta: FREE, idempotency_key: `signup:${id}` }])
  })

  it('settles concurrent first sign-ins (callback + password) exactly once', async () => {
    const id = await createUser(db)
    const firsts = await Promise.all(Array.from({ length: 5 }, () => grantSignupCredits(billingGrant(admin), id, FREE)))
    expect(firsts.filter(Boolean)).toHaveLength(1)
    expect(await profileOf(db, id)).toMatchObject({ credits: 0, free_credits: FREE })
    expect(await ledgerOf(db, id)).toHaveLength(1)
  })

  it('stores signup_ip before granting and never overwrites it', async () => {
    const id = await createUser(db)
    await recordSignupIp(admin, id, '203.0.113.9')
    await recordSignupIp(admin, id, '198.51.100.2')
    const { rows } = await db.query('select signup_ip from public.profiles where id = $1', [id])
    expect(rows[0]?.signup_ip).toBe('203.0.113.9')
  })
})
