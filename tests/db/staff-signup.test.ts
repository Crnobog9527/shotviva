import type { Client } from 'pg'
import { afterAll, beforeAll, expect, it } from 'vitest'

import { readSignupGift } from '@/core/auth'
import { billingGrant, grantSignupCredits } from '@/core/auth/free-credits'
import { recordSignupIp } from '@/core/auth/signup-ip'
import { claimSignupGift } from '@/core/auth/signup-gift-claim'
import { markStaffSignup } from '@/core/auth/staff-signup'
import { site } from '@/site/site.config'

import { connectAdmin, createUser } from './helpers'
import { serviceSupabase } from './supabase-env'

// 1940 (ARCHITECTURE §6.5 员工账号): a staff-link signup stores the refusal 'staff', and no later
// sign-in, claim or removal from the org pays the signup gift (Owner 2026-11-22).

let db: Client
const service = serviceSupabase()
const FREE = site.billing.freeCredits
beforeAll(async () => { db = await connectAdmin() })
afterAll(async () => { await db.end() })

const refusal = async (id: string) =>
  (await db.query<{ r: string | null }>('select signup_gift_refusal as r from public.profiles where id = $1', [id])).rows[0]?.r
const signupRows = async (id: string) =>
  Number((await db.query<{ n: string }>('select count(*) as n from public.credit_ledger where idempotency_key = $1', [`signup:${id}`])).rows[0]!.n)

it('never pays the gift to a marked staff account: not on a later sign-in, not by a claim', async () => {
  const id = await createUser(db)
  await recordSignupIp(service, id, '198.51.100.40')
  await markStaffSignup(service, id)
  expect(await refusal(id)).toBe('staff')
  // A later ordinary sign-in retries the gift: the stored refusal stands.
  expect(await grantSignupCredits(billingGrant(service), id, FREE)).toBe(false)
  expect(['not_pending', 'method_off', 'no_identity']).toContain(await claimSignupGift(service, id, null))
  expect(await signupRows(id)).toBe(0)
  expect(await readSignupGift(service, id, FREE)).toEqual({ granted: 0, refused: true, reason: 'staff' })
})

it('leaves a gift already paid alone', async () => {
  const id = await createUser(db)
  expect(await grantSignupCredits(billingGrant(service), id, FREE)).toBe(true)
  const { data } = await service.rpc('mark_staff_signup', { p_user_id: id })
  expect(data).toBe(false)
  expect(await refusal(id)).toBeNull()
  expect(await signupRows(id)).toBe(1)
})

it('is callable by the service role only', async () => {
  const { rows } = await db.query(`select r as role, has_function_privilege(r, 'public.mark_staff_signup(uuid)', 'execute') as can
    from unnest(array['anon','authenticated','service_role']) r order by r`)
  expect(rows).toEqual([{ role: 'anon', can: false }, { role: 'authenticated', can: false }, { role: 'service_role', can: true }])
})
