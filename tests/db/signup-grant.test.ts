import { createClient } from '@supabase/supabase-js'
import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { billingGrant, grantSignupCredits } from '@/core/auth/free-credits'
import { recordSignupIp } from '@/core/auth/signup-ip'

import { connectAdmin, createUser, ledgerOf, localSupabase, profileOf } from './helpers'

// T1's first-sign-in path against T2's real grant_credits (no mock).
const { apiUrl, serviceRoleKey } = localSupabase()
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
    for (let i = 0; i < 3; i += 1) await grantSignupCredits(billingGrant(admin), id, 3)
    expect((await profileOf(db, id)).credits).toBe(3)
    expect(await ledgerOf(db, id)).toEqual([{ kind: 'grant', delta: 3, idempotency_key: `signup:${id}` }])
  })

  it('settles concurrent first sign-ins (callback + password) exactly once', async () => {
    const id = await createUser(db)
    await Promise.all(Array.from({ length: 5 }, () => grantSignupCredits(billingGrant(admin), id, 3)))
    expect((await profileOf(db, id)).credits).toBe(3)
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
