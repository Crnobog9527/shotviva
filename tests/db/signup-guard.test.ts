import { randomBytes, randomUUID } from 'node:crypto'

import type { Client } from 'pg'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { readSignupGift } from '@/core/auth'
import { billingGrant, grantSignupCredits } from '@/core/auth/free-credits'
import { phoneKey } from '@/core/auth/phone/phone-key'
import { parseMainlandPhone } from '@/core/auth/phone/phone-number'
import { requestSmsSend } from '@/core/auth/phone'
import { recordSignupIp } from '@/core/auth/signup-ip'
import { emailKey, requestSignup } from '@/core/auth/signup-request'
import { readSignupGiftToday } from '@/core/alerts/signup-gift'
import { site } from '@/site/site.config'

import { TEST_SIGNUP_GIFT_CAP } from './global-setup'
import { connectAdmin, createUser, profileOf } from './helpers'
import { anonSupabase, serviceSupabase } from './supabase-env'

// 1350 (ARCHITECTURE §7): the signup gift's daily cap and pause, the stored refusal, the
// per-IP sign-up limit, and the Before User Created hook that only lets through accounts our
// server registered first.

let db: Client
const service = serviceSupabase()
const FREE = site.billing.freeCredits
const grant = (id: string) => grantSignupCredits(billingGrant(service), id, FREE)
const ip = () => `198.51.${randomBytes(1)[0]}.${(randomBytes(1)[0] ?? 0) % 250 + 1}`

const setSetting = (key: string, value: unknown) =>
  db.query(
    `insert into public.system_settings (key, value) values ($1, $2::jsonb)
     on conflict (key) do update set value = excluded.value`,
    [key, JSON.stringify(value)],
  )
const today = async () => (await readSignupGiftToday(service)).granted
const refusalOf = async (id: string) =>
  (await db.query<{ r: string | null }>('select signup_gift_refusal as r from public.profiles where id = $1', [id])).rows[0]?.r

// A new account's first verified sign-in from its own IP, as onVerifiedSignIn runs it.
async function newAccount() {
  const id = await createUser(db)
  await recordSignupIp(service, id, ip())
  return id
}

beforeAll(async () => {
  db = await connectAdmin()
})
afterEach(async () => {
  await setSetting('signup_gift_daily_cap', TEST_SIGNUP_GIFT_CAP)
  await db.query(`delete from public.system_settings where key = 'signup_gift_paused'`)
})
afterAll(async () => {
  await db.end()
})

describe('signup gift daily cap', () => {
  it('pays up to the cap, then refuses for good, without touching accounts already paid', async () => {
    await setSetting('signup_gift_daily_cap', (await today()) + 2)
    const [a, b, c] = [await newAccount(), await newAccount(), await newAccount()]
    expect([await grant(a), await grant(b), await grant(c)]).toEqual([true, true, false])
    expect(await refusalOf(c)).toBe('daily_cap')
    expect((await profileOf(db, c)).free_credits).toBe(0)
    expect(await readSignupGift(service, c, FREE)).toMatchObject({ refused: true, reason: 'daily_cap' })
    // A replay for a paid account at the cap is still a no-op, never a refusal.
    expect(await grant(a)).toBe(false)
    expect(await refusalOf(a)).toBeNull()
    expect(await readSignupGift(service, a, FREE)).toMatchObject({ refused: false, reason: null })
    // Raising the cap later does not pay the refused account.
    await setSetting('signup_gift_daily_cap', TEST_SIGNUP_GIFT_CAP)
    expect(await grant(c)).toBe(false)
    expect((await profileOf(db, c)).free_credits).toBe(0)
  })

  it('counts only today in Beijing', async () => {
    const before = await today()
    const old = await newAccount()
    expect(await grant(old)).toBe(true)
    expect(await today()).toBe(before + 1)
    await db.query(`update public.credit_ledger set created_at = public.signup_gift_day_start() - interval '1 minute' where idempotency_key = $1`, [`signup:${old}`])
    expect(await today()).toBe(before)
  })

  it('holds under concurrent first sign-ins', async () => {
    await setSetting('signup_gift_daily_cap', (await today()) + 2)
    const ids = await Promise.all(Array.from({ length: 6 }, () => newAccount()))
    const results = await Promise.all(ids.map((id) => grant(id)))
    expect(results.filter(Boolean)).toHaveLength(2)
  })

  it('a cap of 0 gives nothing', async () => {
    await setSetting('signup_gift_daily_cap', 0)
    const id = await newAccount()
    expect(await grant(id)).toBe(false)
    expect(await refusalOf(id)).toBe('daily_cap')
  })
})

describe('signup gift pause', () => {
  it('refuses every new account while on, for good, and reports it', async () => {
    await setSetting('signup_gift_paused', true)
    expect((await readSignupGiftToday(service)).paused).toBe(true)
    const id = await newAccount()
    expect(await grant(id)).toBe(false)
    expect(await refusalOf(id)).toBe('paused')
    expect(await readSignupGift(service, id, FREE)).toMatchObject({ reason: 'paused' })
    await setSetting('signup_gift_paused', false)
    expect(await grant(id)).toBe(false)
    expect(await grant(await newAccount())).toBe(true)
  })

  it('records the per-network refusal too (pending since 1480)', async () => {
    const shared = ip()
    const [first, second] = [await createUser(db), await createUser(db)]
    await recordSignupIp(service, first, shared)
    await recordSignupIp(service, second, shared)
    expect([await grant(first), await grant(second)]).toEqual([true, false])
    expect(await refusalOf(second)).toBe('same_ip_pending')
  })
})

describe('admin_set_system_setting (signup gift keys)', () => {
  let adminId: string
  beforeAll(async () => {
    adminId = await createUser(db)
    await db.query(`update public.profiles set role = 'admin' where id = $1`, [adminId])
  })
  const save = (key: string, value: unknown) => service.rpc('admin_set_system_setting', { p_key: key, p_value: value, p_actor: adminId })

  it('accepts an integer cap from 0 to 100000 and a boolean pause', async () => {
    expect((await save('signup_gift_daily_cap', 50)).error).toBeNull()
    expect((await readSignupGiftToday(service)).cap).toBe(50)
    expect((await save('signup_gift_paused', true)).error).toBeNull()
    for (const bad of [-1, 1.5, 100001, '30', true]) expect((await save('signup_gift_daily_cap', bad)).error).not.toBeNull()
    expect((await save('signup_gift_paused', 'yes')).error).not.toBeNull()
  })

  it('refuses a banned admin', async () => {
    await db.query(`update public.profiles set banned_at = now() where id = $1`, [adminId])
    expect((await save('signup_gift_paused', false)).error?.message).toContain('NOT_ADMIN')
    await db.query(`update public.profiles set banned_at = null where id = $1`, [adminId])
  })
})

describe('signup_request (the sign-up server action)', () => {
  it('allows 5 per IP an hour and 20 a day; no IP is not counted', async () => {
    const address = ip()
    await db.query('delete from public.signup_requests where ip = $1', [address])
    for (let i = 0; i < 5; i++) expect(await requestSignup(service, `${randomUUID()}@example.test`, address)).toBe('ok')
    expect(await requestSignup(service, `${randomUUID()}@example.test`, address)).toBe('ip_hourly')
    await db.query(`update public.signup_requests set requested_at = requested_at - interval '61 minutes' where ip = $1`, [address])
    for (let i = 0; i < 5; i++) expect(await requestSignup(service, `${randomUUID()}@example.test`, address)).toBe('ok')
    await db.query(`update public.signup_requests set requested_at = requested_at - interval '61 minutes' where ip = $1`, [address])
    for (let i = 0; i < 10; i++) {
      expect(await requestSignup(service, `${randomUUID()}@example.test`, address)).toBe('ok')
      if (i === 4) await db.query(`update public.signup_requests set requested_at = requested_at - interval '61 minutes' where ip = $1`, [address])
    }
    await db.query(`update public.signup_requests set requested_at = requested_at - interval '61 minutes' where ip = $1`, [address])
    expect(await requestSignup(service, `${randomUUID()}@example.test`, address)).toBe('ip_daily')
    expect(await requestSignup(service, `${randomUUID()}@example.test`, null)).toBe('ok')
  })

  it('is closed to the browser roles, and so is the table', async () => {
    const { error } = await anonSupabase().rpc('signup_request', { p_email_key: emailKey('a@b.c'), p_ip: null })
    expect(error).not.toBeNull()
    expect((await anonSupabase().from('signup_requests').select('id')).data ?? []).toEqual([])
  })
})

// The hook with the event Supabase Auth sends; '{}' allows. (The test connection cannot become
// supabase_auth_admin; its execute grant is checked below, and Auth itself calls it at the end.)
async function hook(user: Record<string, unknown>) {
  const { rows } = await db.query<{ r: Record<string, unknown> }>('select public.hook_before_user_created($1::jsonb) as r', [
    JSON.stringify({ metadata: { name: 'before-user-created', ip_address: '127.0.0.1' }, user }),
  ])
  return rows[0]!.r
}

describe('hook_before_user_created', () => {
  it('lets an email account through only after a recent request from our server', async () => {
    const email = `guard-${randomUUID()}@example.test`
    const user = { email: email.toUpperCase(), phone: '', app_metadata: { provider: 'email' } }
    expect(await hook(user)).toMatchObject({ error: { http_code: 403 } })
    await requestSignup(service, email, ip())
    expect(await hook(user)).toEqual({})
    await db.query(`update public.signup_requests set requested_at = now() - interval '11 minutes' where email_key = $1`, [emailKey(email)])
    expect(await hook(user)).toMatchObject({ error: { http_code: 403 } })
  })

  it('lets a phone account through only after a recent SMS request', async () => {
    const phone = parseMainlandPhone(`140${String(randomBytes(4).readUInt32BE() % 100_000_000).padStart(8, '0')}`)!
    const user = { email: '', phone: phone.digits, app_metadata: { provider: 'phone' } }
    expect(await hook(user)).toMatchObject({ error: { http_code: 403 } })
    expect(await requestSmsSend(service, phoneKey(phone), ip())).toBe('ok')
    expect(await hook(user)).toEqual({})
  })

  it('lets Google through, and is closed to every other role', async () => {
    expect(await hook({ email: 'g@example.test', phone: '', app_metadata: { provider: 'google' } })).toEqual({})
    const { error } = await service.rpc('hook_before_user_created', { event: {} })
    expect(error).not.toBeNull()
    const { rows } = await db.query<Record<string, boolean>>(
      `select ${['supabase_auth_admin', 'anon', 'authenticated', 'service_role']
        .map((r) => `has_function_privilege('${r}', 'public.hook_before_user_created(jsonb)', 'execute') as ${r}`)
        .join(', ')}`,
    )
    expect(rows[0]).toEqual({ supabase_auth_admin: true, anon: false, authenticated: false, service_role: false })
  })
})

// End to end through the local Auth API, with the hook enabled in supabase/config.toml.
describe('Before User Created hook in Supabase Auth', () => {
  it('refuses a direct API sign-up, and accepts one the server registered first', async () => {
    const direct = `direct-${randomUUID()}@example.test`
    const refused = await anonSupabase().auth.signUp({ email: direct, password: `Pw-${randomUUID()}` })
    expect(refused.error).not.toBeNull()
    expect((await db.query('select 1 from auth.users where email = $1', [direct])).rowCount).toBe(0)

    const ours = `ours-${randomUUID()}@example.test`
    expect(await requestSignup(service, ours, null)).toBe('ok')
    const accepted = await anonSupabase().auth.signUp({ email: ours, password: `Pw-${randomUUID()}` })
    expect(accepted.error).toBeNull()
    expect((await db.query('select 1 from auth.users where email = $1', [ours])).rowCount).toBe(1)
  })

  it('never stops admin-created users (QA scripts, tests)', async () => {
    const { error } = await service.auth.admin.createUser({ email: `admin-made-${randomUUID()}@example.test`, email_confirm: true })
    expect(error).toBeNull()
  })
})
