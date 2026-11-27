import type { Client } from 'pg'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { billingGrant, grantSignupCredits } from '@/core/auth/free-credits'
import { claimSignupGift } from '@/core/auth/signup-gift-claim'
import { recordSignupIp } from '@/core/auth/signup-ip'

import { connectAdmin, createUser, profileOf } from './helpers'
import { serviceSupabase } from './supabase-env'

// 2008 (ARCHITECTURE §7): the signup gift's amount is system_settings signup_gift_credits (1–5000,
// default 200, Owner 2026-11-27), read in SQL when the gift is paid, never taken from the caller. The idempotency key
// is unchanged, so an account is paid once at the amount of that moment.

let db: Client
const service = serviceSupabase()
let hadCutover = false
let admin = ''

const setAmount = (value: unknown) =>
  db.query(
    `insert into public.system_settings (key, value) values ('signup_gift_credits', $1::jsonb)
     on conflict (key) do update set value = excluded.value`,
    [JSON.stringify(value)],
  )
const signupRows = async (id: string) =>
  (await db.query<{ delta: number }>('select delta from public.credit_ledger where idempotency_key = $1', [`signup:${id}`])).rows.map((r) => Number(r.delta))
const adminSet = (value: unknown, actor = admin) =>
  db.query('select public.admin_set_system_setting($1, $2::jsonb, $3)', ['signup_gift_credits', JSON.stringify(value), actor])

beforeAll(async () => {
  db = await connectAdmin()
  // The amount applies to accounts created after the v2 cutover (1480); keep an existing cutover.
  hadCutover = (await db.query("select 1 from public.system_settings where key = 'pricing_catalog_version' and value = '\"v2\"'::jsonb")).rowCount === 1
  if (!hadCutover) {
    await db.query(`insert into public.system_settings (key, value) values ('pricing_catalog_version', '"v2"')
      on conflict (key) do update set value = excluded.value, updated_at = now()`)
  }
  admin = await createUser(db)
  await db.query("update public.profiles set role = 'admin' where id = $1", [admin])
})
afterEach(async () => {
  await db.query("delete from public.system_settings where key = 'signup_gift_credits'")
})
afterAll(async () => {
  if (!hadCutover) await db.query("delete from public.system_settings where key = 'pricing_catalog_version'")
  await db.end()
})

describe('signup gift amount (2008)', () => {
  it('pays the default 200 with no setting', async () => {
    const id = await createUser(db)
    expect(await grantSignupCredits(billingGrant(service), id, 100)).toBe(true)
    expect(await signupRows(id)).toEqual([200])
  })

  it('pays the saved amount, whatever amount the caller passes', async () => {
    await setAmount(300)
    const id = await createUser(db)
    expect(await grantSignupCredits(billingGrant(service), id, 9999)).toBe(true)
    expect(await signupRows(id)).toEqual([300])
    expect((await profileOf(db, id)).free_credits).toBe(300)
  })

  it('pays once: a later change neither pays again nor changes what was paid', async () => {
    await setAmount(300)
    const id = await createUser(db)
    expect(await grantSignupCredits(billingGrant(service), id, 300)).toBe(true)
    await setAmount(800)
    expect(await grantSignupCredits(billingGrant(service), id, 800)).toBe(false)
    expect(await signupRows(id)).toEqual([300])
  })

  it.each([0, 5001, -5, '300', true])('falls back to 200 for a stored %o outside the range', async (value) => {
    await setAmount(value)
    const id = await createUser(db)
    expect(await grantSignupCredits(billingGrant(service), id, 100)).toBe(true)
    expect(await signupRows(id)).toEqual([200])
  })

  it('pays a pending account the amount of the moment it claims', async () => {
    const address = `198.51.100.${Math.floor(Math.random() * 250) + 1}`
    const first = await createUser(db)
    const second = await createUser(db)
    await recordSignupIp(service, first, address)
    await recordSignupIp(service, second, address)
    expect(await grantSignupCredits(billingGrant(service), first, 100)).toBe(true)
    expect(await grantSignupCredits(billingGrant(service), second, 100)).toBe(false)
    await setAmount(450)
    const digits = `86140${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`
    await db.query('update auth.users set phone = $2, phone_confirmed_at = now() where id = $1', [second, digits])
    expect(await claimSignupGift(service, second, 'phone')).toBe('granted')
    expect(await signupRows(second)).toEqual([450])
  })

  it('shows the amount in the admin card summary', async () => {
    await setAmount(250)
    const today = (await db.query<{ t: { credits: number } }>('select public.signup_gift_today() as t')).rows[0]!.t
    expect(today.credits).toBe(250)
  })

  it('takes 1 to 5000 from an admin and refuses anything else', async () => {
    await adminSet(1)
    await adminSet(5000)
    for (const bad of [0, 5001, 2.5, '300', -1, null]) await expect(adminSet(bad)).rejects.toThrow(/INVALID_INPUT/)
    const other = await createUser(db)
    await expect(adminSet(300, other)).rejects.toThrow(/NOT_ADMIN/)
  })
})
