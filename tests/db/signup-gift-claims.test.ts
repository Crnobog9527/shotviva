import { createHash, randomBytes, randomUUID } from 'node:crypto'

import type { Client } from 'pg'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { readSignupGift } from '@/core/auth'
import { billingGrant, grantSignupCredits } from '@/core/auth/free-credits'
import { phoneKey } from '@/core/auth/phone/phone-key'
import { parseMainlandPhone } from '@/core/auth/phone/phone-number'
import { recordSignupIp } from '@/core/auth/signup-ip'
import { claimQuietly, claimSignupGift, readClaimOptions } from '@/core/auth/signup-gift-claim'
import { readSignupGiftToday } from '@/core/alerts/signup-gift'
import { site } from '@/site/site.config'

import { TEST_SIGNUP_GIFT_CAP, TEST_SIGNUP_GIFT_PER_IP } from './global-setup'
import { connectAdmin, createUser, profileOf } from './helpers'
import { anonSupabase, serviceSupabase } from './supabase-env'

// 1480 (ARCHITECTURE §7): a network may receive signup_gift_per_ip signup gifts in 24 hours;
// accounts over it are pending and claim later with a verified phone or a Google account, each
// of which pays one signup gift ever. The daily cap and the pause still apply at claim time.

let db: Client
const service = serviceSupabase()
const FREE = site.billing.freeCredits
const grant = (id: string) => grantSignupCredits(billingGrant(service), id, FREE)
const claim = (id: string, method: 'phone' | 'google' | null = null) => claimSignupGift(service, id, method)
const ip = () => `203.0.${randomBytes(1)[0]}.${((randomBytes(1)[0] ?? 0) % 250) + 1}`
const phone = () => parseMainlandPhone(`140${String(randomBytes(4).readUInt32BE() % 100_000_000).padStart(8, '0')}`)!

const setSetting = (key: string, value: unknown) =>
  db.query(
    `insert into public.system_settings (key, value) values ($1, $2::jsonb)
     on conflict (key) do update set value = excluded.value`,
    [key, JSON.stringify(value)],
  )
const today = async () => (await readSignupGiftToday(service)).granted
const refusalOf = async (id: string) =>
  (await db.query<{ r: string | null }>('select signup_gift_refusal as r from public.profiles where id = $1', [id])).rows[0]?.r
const signupRows = async (id: string) =>
  Number((await db.query<{ n: string }>('select count(*) as n from public.credit_ledger where idempotency_key = $1', [`signup:${id}`])).rows[0]!.n)

// Accounts that verify from one network, in order.
async function onNetwork(count: number, address = ip()) {
  const ids: string[] = []
  for (let i = 0; i < count; i++) {
    const id = await createUser(db)
    await recordSignupIp(service, id, address)
    ids.push(id)
  }
  return ids
}

// A pending account: the network's allowance (1 here) went to someone else first.
async function pendingAccount() {
  await setSetting('signup_gift_per_ip', 1)
  const [first, second] = await onNetwork(2)
  expect(await grant(first!)).toBe(true)
  expect(await grant(second!)).toBe(false)
  expect(await refusalOf(second!)).toBe('same_ip_pending')
  return second!
}

// What Supabase Auth stores once a phone change is verified, and a linked Google identity.
const confirmPhone = (id: string, digits: string | null) =>
  db.query('update auth.users set phone = $2, phone_confirmed_at = case when $2::text is null then null else now() end where id = $1', [id, digits])
const linkGoogle = (id: string, sub: string) =>
  db.query(
    `insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
     values ($1, $2, jsonb_build_object('sub', $1::text), 'google', now(), now(), now())`,
    [sub, id],
  )
const claimKeys = async (id: string) =>
  (await db.query<{ method: string; key_hash: string }>('select method, key_hash from public.signup_gift_claims where user_id = $1 order by method', [id])).rows

beforeAll(async () => {
  db = await connectAdmin()
})
afterEach(async () => {
  await setSetting('signup_gift_daily_cap', TEST_SIGNUP_GIFT_CAP)
  await setSetting('signup_gift_per_ip', TEST_SIGNUP_GIFT_PER_IP)
  await db.query(`delete from public.system_settings where key in ('signup_gift_paused', 'signup_gift_claim_phone', 'signup_gift_claim_google')`)
})
afterAll(async () => {
  await db.end()
})

describe('signup_gift_per_ip', () => {
  it('pays the first N accounts of a network, then leaves the rest pending', async () => {
    await setSetting('signup_gift_per_ip', 3)
    const ids = await onNetwork(5)
    const results = []
    for (const id of ids) results.push(await grant(id))
    expect(results).toEqual([true, true, true, false, false])
    expect(await refusalOf(ids[3]!)).toBe('same_ip_pending')
    expect(await readSignupGift(service, ids[4]!, FREE)).toMatchObject({ refused: true, reason: 'same_ip_pending', granted: 0 })
  })

  it('holds under concurrent first sign-ins from one network', async () => {
    await setSetting('signup_gift_per_ip', 2)
    const ids = await onNetwork(8)
    const results = await Promise.all(ids.map((id) => grant(id)))
    expect(results.filter(Boolean)).toHaveLength(2)
    const pending = await db.query(`select count(*)::int as n from public.profiles where id = any($1) and signup_gift_refusal = 'same_ip_pending'`, [ids])
    expect(pending.rows[0].n).toBe(6)
  })

  it('0 means no per-network limit; other networks are not counted', async () => {
    await setSetting('signup_gift_per_ip', 0)
    const ids = await onNetwork(4)
    for (const id of ids) expect(await grant(id)).toBe(true)
    await setSetting('signup_gift_per_ip', 1)
    const [other] = await onNetwork(1)
    expect(await grant(other!)).toBe(true)
  })

  it('a replayed grant for a paid account is a no-op, never a refusal', async () => {
    await setSetting('signup_gift_per_ip', 1)
    const [first] = await onNetwork(1)
    expect(await grant(first!)).toBe(true)
    expect(await grant(first!)).toBe(false)
    expect(await refusalOf(first!)).toBeNull()
    expect(await signupRows(first!)).toBe(1)
  })

  it('older same-IP refusals are pending too: 1350 same_ip, and no reason with a recorded IP', async () => {
    for (const refusal of ['same_ip', null]) {
      const [id] = await onNetwork(1)
      await db.query('update public.profiles set signup_gift_refusal = $2 where id = $1', [id, refusal])
      expect(await readSignupGift(service, id!, FREE)).toMatchObject({ refused: true, reason: 'same_ip_pending' })
      await confirmPhone(id!, phone().digits)
      expect(await claim(id!)).toBe('granted')
      expect(await readSignupGift(service, id!, FREE)).toMatchObject({ refused: false, granted: FREE })
    }
    // Without a recorded IP there was no same-IP refusal: nothing to claim.
    const bare = await createUser(db)
    await confirmPhone(bare, phone().digits)
    expect(await claim(bare)).toBe('not_pending')
  })
})

describe('claim_signup_gift by phone', () => {
  it('pays a pending account once it has a confirmed phone, once', async () => {
    const id = await pendingAccount()
    expect(await claim(id)).toBe('no_identity')
    expect(await claim(id, 'phone')).toBe('no_identity')
    const before = await today()
    const number = phone()
    await confirmPhone(id, number.digits)
    expect(await claim(id, 'phone')).toBe('granted')
    expect((await profileOf(db, id)).free_credits).toBe(FREE)
    expect(await refusalOf(id)).toBeNull()
    expect(await today()).toBe(before + 1)
    expect(await readSignupGift(service, id, FREE)).toMatchObject({ refused: false, granted: FREE })
    // The key is the same sha256 of the digits as sms_sends uses.
    expect(await claimKeys(id)).toEqual([{ method: 'phone', key_hash: phoneKey(number) }])
    // Replays: the claim, and the grant at the next sign-in.
    expect(await claim(id, 'phone')).toBe('not_pending')
    expect(await grant(id)).toBe(false)
    expect(await signupRows(id)).toBe(1)
  })

  it('one gift per phone number ever: a number that paid cannot pay another account', async () => {
    const [a, b] = [await pendingAccount(), await pendingAccount()]
    const number = phone()
    await confirmPhone(a, number.digits)
    expect(await claim(a)).toBe('granted')
    // The number moves to b (a dropped it, or a was deleted): it still paid once.
    await confirmPhone(a, null)
    await confirmPhone(b, number.digits)
    expect(await claim(b, 'phone')).toBe('already_used')
    expect(await refusalOf(b)).toBe('same_ip_pending')
    expect((await profileOf(db, b)).free_credits).toBe(0)
  })

  it('a phone sign-up paid normally spends its number too', async () => {
    await setSetting('signup_gift_per_ip', 0)
    const [paid] = await onNetwork(1)
    const number = phone()
    await confirmPhone(paid!, number.digits)
    expect(await grant(paid!)).toBe(true)
    expect(await claimKeys(paid!)).toEqual([{ method: 'phone', key_hash: phoneKey(number) }])
    const pending = await pendingAccount()
    await confirmPhone(paid!, null)
    await confirmPhone(pending, number.digits)
    expect(await claim(pending)).toBe('already_used')
  })

  it('an unconfirmed phone does not count', async () => {
    const id = await pendingAccount()
    await db.query('update auth.users set phone = $2, phone_confirmed_at = null where id = $1', [id, phone().digits])
    expect(await claim(id)).toBe('no_identity')
  })
})

describe('claim_signup_gift by Google', () => {
  it('pays a pending account with a linked Google identity; the Google account pays once', async () => {
    const [a, b] = [await pendingAccount(), await pendingAccount()]
    const sub = `g-${randomUUID()}`
    await linkGoogle(a, sub)
    expect(await claim(a, 'phone')).toBe('no_identity')
    expect(await claim(a, 'google')).toBe('granted')
    expect((await claimKeys(a))[0]).toEqual({ method: 'google', key_hash: createHash('sha256').update(`google:${sub}`).digest('hex') })
    // The same Google account on another account (unlinked from a first) pays nothing more.
    await db.query(`delete from auth.identities where user_id = $1 and provider = 'google'`, [a])
    await linkGoogle(b, sub)
    expect(await claim(b)).toBe('already_used')
  })

  it('an account that paid spends all its keys, so a phone it adds later pays nothing elsewhere', async () => {
    const [a, b] = [await pendingAccount(), await pendingAccount()]
    const number = phone()
    await confirmPhone(a, number.digits)
    await linkGoogle(a, `g-${randomUUID()}`)
    expect(await claim(a)).toBe('granted')
    expect((await claimKeys(a)).map((k) => k.method)).toEqual(['google', 'phone'])
    await confirmPhone(a, null)
    await confirmPhone(b, number.digits)
    expect(await claim(b)).toBe('already_used')
  })
})

describe('claim_signup_gift: switches, cap and pause', () => {
  it('a method the admin switched off does not pay; the other still does', async () => {
    const id = await pendingAccount()
    await confirmPhone(id, phone().digits)
    await setSetting('signup_gift_claim_phone', false)
    expect(await claim(id, 'phone')).toBe('method_off')
    expect(await claim(id)).toBe('no_identity')
    await setSetting('signup_gift_claim_google', false)
    expect(await claim(id)).toBe('method_off')
    expect(await readClaimOptions(service)).toMatchObject({ phone: false, google: false })
    await setSetting('signup_gift_claim_phone', true)
    expect(await claim(id)).toBe('granted')
  })

  it('the pause and the daily cap hold a claim back without ending it', async () => {
    const id = await pendingAccount()
    await confirmPhone(id, phone().digits)
    await setSetting('signup_gift_paused', true)
    expect(await claim(id)).toBe('paused')
    await setSetting('signup_gift_paused', false)
    await setSetting('signup_gift_daily_cap', await today())
    expect(await claim(id)).toBe('daily_cap')
    expect(await refusalOf(id)).toBe('same_ip_pending')
    expect(await claimKeys(id)).toEqual([])
    await setSetting('signup_gift_daily_cap', TEST_SIGNUP_GIFT_CAP)
    expect(await claim(id)).toBe('granted')
  })

  it('daily_cap and paused refusals at sign-up stay final', async () => {
    await setSetting('signup_gift_per_ip', 0)
    await setSetting('signup_gift_paused', true)
    const [id] = await onNetwork(1)
    expect(await grant(id!)).toBe(false)
    await setSetting('signup_gift_paused', false)
    await confirmPhone(id!, phone().digits)
    expect(await claim(id!)).toBe('not_pending')
  })

  it('claimQuietly (after each verified sign-in) pays a pending phone account and never throws', async () => {
    const id = await pendingAccount()
    await confirmPhone(id, phone().digits)
    expect(await claimQuietly(service, id)).toBe(true)
    expect(await claimQuietly(service, id)).toBe(false)
    expect(await claimQuietly(service, randomUUID())).toBe(false)
  })
})

describe('claim_signup_gift under concurrency', () => {
  it('holds the daily cap when many pending accounts claim at once', async () => {
    const ids = await Promise.all(Array.from({ length: 5 }, () => pendingAccount()))
    for (const id of ids) await confirmPhone(id, phone().digits)
    await setSetting('signup_gift_daily_cap', (await today()) + 2)
    const results = await Promise.all(ids.map((id) => claim(id)))
    expect(results.filter((r) => r === 'granted')).toHaveLength(2)
    expect(results.filter((r) => r === 'daily_cap')).toHaveLength(3)
  })

  it('pays one account once however often it claims at the same time', async () => {
    const id = await pendingAccount()
    await confirmPhone(id, phone().digits)
    const results = await Promise.all(Array.from({ length: 6 }, () => claim(id)))
    expect(results.filter((r) => r === 'granted')).toHaveLength(1)
    expect(await signupRows(id)).toBe(1)
    expect((await profileOf(db, id)).free_credits).toBe(FREE)
  })

  it('a claim racing the same account first sign-in grant pays once', async () => {
    const id = await pendingAccount()
    await confirmPhone(id, phone().digits)
    const [granted, claimed] = await Promise.all([grant(id), claim(id)])
    expect(granted).toBe(false)
    expect(claimed).toBe('granted')
    expect(await signupRows(id)).toBe(1)
  })
})

describe('admin_set_system_setting (1480 keys) and access', () => {
  let adminId: string
  beforeAll(async () => {
    adminId = await createUser(db)
    await db.query(`update public.profiles set role = 'admin' where id = $1`, [adminId])
  })
  const save = (key: string, value: unknown) => service.rpc('admin_set_system_setting', { p_key: key, p_value: value, p_actor: adminId })

  it('accepts the per-network allowance 0..1000 and boolean claim switches', async () => {
    expect((await save('signup_gift_per_ip', 7)).error).toBeNull()
    expect((await readSignupGiftToday(service))).toMatchObject({ cap: TEST_SIGNUP_GIFT_CAP })
    expect((await readClaimOptions(service)).perIp).toBe(7)
    expect((await save('signup_gift_claim_google', false)).error).toBeNull()
    expect((await readClaimOptions(service)).google).toBe(false)
    for (const bad of [-1, 1.5, 1001, '5', true]) expect((await save('signup_gift_per_ip', bad)).error).not.toBeNull()
    expect((await save('signup_gift_claim_phone', 'yes')).error).not.toBeNull()
  })

  it('refuses a banned admin', async () => {
    await db.query(`update public.profiles set banned_at = now() where id = $1`, [adminId])
    expect((await save('signup_gift_per_ip', 3)).error?.message).toContain('NOT_ADMIN')
    await db.query(`update public.profiles set banned_at = null where id = $1`, [adminId])
  })

  it('claim_signup_gift and the claims table are closed to the browser roles', async () => {
    expect((await anonSupabase().rpc('claim_signup_gift', { p_user_id: randomUUID(), p_method: null })).error).not.toBeNull()
    expect((await anonSupabase().from('signup_gift_claims').select('key_hash')).data ?? []).toEqual([])
    const { rows } = await db.query<Record<string, boolean>>(
      `select ${['anon', 'authenticated', 'service_role']
        .map((r) => `has_function_privilege('${r}', 'public.claim_signup_gift(uuid, text)', 'execute') as ${r}`)
        .join(', ')}`,
    )
    expect(rows[0]).toEqual({ anon: false, authenticated: false, service_role: true })
  })

  it('an unknown method is refused', async () => {
    expect((await service.rpc('claim_signup_gift', { p_user_id: randomUUID(), p_method: 'email' })).error?.message).toContain('INVALID_INPUT')
  })
})
