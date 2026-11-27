import { randomBytes } from 'node:crypto'

import type { Client } from 'pg'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { emailKey } from '@/core/auth/signup-request'

import { promoter, row } from './affiliate-fixtures'
import { connectAdmin, createUser } from './helpers'
import { anonSupabase, serviceSupabase } from './supabase-env'

// 2027 (ARCHITECTURE §7, §6.5): the per-IP limits on signup_request and the SMS functions are
// admin settings, with a looser pair through a valid org ?ref link (decided by the database from
// the slug, 2024's rule), never stricter than the site-wide one. Most tests run in a transaction
// that is rolled back, calling the functions in SQL, so the settings they change never leak into
// other files. Fake data only.

let db: Client
let actor: string
const key = () => randomBytes(32).toString('hex')
const ip = () => `203.0.${randomBytes(1)[0]}.${((randomBytes(1)[0] ?? 0) % 250) + 1}`
const setSetting = (name: string, value: unknown) =>
  db.query('insert into system_settings(key,value) values($1,$2::jsonb) on conflict(key) do update set value=excluded.value', [name, JSON.stringify(value)])
const signup = async (address: string | null, slug: string | null = null) =>
  (await row(db, 'select signup_request($1,$2::inet,$3) as s', [key(), address, slug])).s as string
const sms = async (address: string | null, slug: string | null = null, phone = key()) =>
  (await row(db, 'select sms_request_send($1,$2::inet,$3) as s', [phone, address, slug])).s as string
const authorize = async (phone: string) => (await row(db, 'select sms_authorize_send($1) as s', [phone])).s as string
const save = (name: string, value: unknown, who = actor) =>
  db.query('savepoint s').then(() =>
    db.query('select admin_set_system_setting($1,$2::jsonb,$3)', [name, JSON.stringify(value), who]).then(
      () => db.query('release savepoint s').then(() => null),
      async (error: Error) => { await db.query('rollback to savepoint s'); return error.message },
    ))

const KEYS = ['signup_request_ip_hourly', 'signup_request_ip_daily', 'signup_request_ip_hourly_partner', 'signup_request_ip_daily_partner', 'sms_ip_daily', 'sms_ip_daily_partner']

beforeAll(async () => { db = await connectAdmin() })
afterAll(async () => { await db.end() })

describe('in a rolled-back transaction', () => {
  beforeEach(async () => {
    await db.query('begin')
    await db.query('update affiliate_settings set enabled=true')
    await db.query('delete from system_settings where key = any($1)', [KEYS])
    actor = await createUser(db)
    await db.query("update profiles set role='admin' where id=$1", [actor])
  })
  afterEach(async () => { await db.query('rollback') })

  async function orgSlug() {
    const owner = await createUser(db)
    const orgId = (await row(db, 'select admin_org_create($1,$2) as id', [actor, { owner_user_id: owner, name: 'Org ' + owner.slice(0, 8), affiliate_enabled: true }])).id as string
    const { slug } = await row(db, 'select slug from affiliates where user_id=$1', [owner])
    return { orgId, slug: slug as string }
  }

  it('defaults: 5 an hour / 20 a day per IP for sign-ups, 50 a day for SMS', async () => {
    expect(await row(db, 'select signup_ip_limits() as l')).toEqual({
      l: { signup_hourly: 5, signup_daily: 20, signup_hourly_partner: 20, signup_daily_partner: 100, sms_daily: 50, sms_daily_partner: 200 },
    })
    const address = ip()
    for (let i = 0; i < 5; i++) expect(await signup(address)).toBe('ok')
    expect(await signup(address)).toBe('ip_hourly')
    const other = ip()
    for (let i = 0; i < 50; i++) expect(await sms(other)).toBe('ok')
    expect(await sms(other)).toBe('ip_daily')
  })

  it('an admin\'s setting replaces the site-wide numbers, also for the old two-argument calls', async () => {
    await setSetting('signup_request_ip_hourly', 2)
    await setSetting('sms_ip_daily', 3)
    const address = ip()
    expect((await row(db, 'select signup_request($1,$2::inet) as s', [key(), address])).s).toBe('ok')
    expect(await signup(address)).toBe('ok')
    expect((await row(db, 'select signup_request($1,$2::inet) as s', [key(), address])).s).toBe('ip_hourly')
    for (let i = 0; i < 3; i++) expect((await row(db, 'select sms_request_send($1,$2::inet) as s', [key(), address])).s).toBe('ok')
    expect(await sms(address)).toBe('ip_daily')
  })

  it('through a valid org ?ref slug: 20 an hour and 100 a day on one network, counted with everyone else', async () => {
    const { slug } = await orgSlug()
    const address = ip()
    for (let i = 0; i < 5; i++) expect(await signup(address)).toBe('ok')
    expect(await signup(address)).toBe('ip_hourly')
    for (let i = 5; i < 20; i++) expect(await signup(address, slug)).toBe('ok')
    expect(await signup(address, slug)).toBe('ip_hourly')
    await db.query("update signup_requests set requested_at = requested_at - interval '61 minutes' where ip = $1", [address])
    for (let i = 20; i < 40; i++) expect(await signup(address, slug)).toBe('ok')
    await db.query("update signup_requests set requested_at = requested_at - interval '61 minutes' where ip = $1", [address])
    expect(await signup(address)).toBe('ip_daily')
    for (let n = 0; n < 3; n++) {
      for (let i = 0; i < 20; i++) expect(await signup(address, slug)).toBe('ok')
      await db.query("update signup_requests set requested_at = requested_at - interval '61 minutes' where ip = $1", [address])
    }
    expect(await signup(address, slug)).toBe('ip_daily')
  })

  it('SMS through a valid org ?ref slug: 200 a day, and the hook counts against the same limit', async () => {
    const { slug } = await orgSlug()
    const address = ip()
    await db.query(
      `insert into sms_sends (phone_key, ip, requested_at, sent_at)
       select encode(sha256(gen_random_uuid()::text::bytea), 'hex'), $1, now() - interval '1 hour', now() - interval '1 hour' from generate_series(1, 60)`,
      [address],
    )
    expect(await sms(address)).toBe('ip_daily')
    const phone = key()
    expect(await sms(address, slug, phone)).toBe('ok')
    expect((await row(db, 'select org_ref from sms_sends where phone_key=$1', [phone])).org_ref).toBe(true)
    expect(await authorize(phone)).toBe('ok')
    // A site-wide request that got through before the network filled up is still stopped by the hook.
    await db.query("insert into sms_sends (phone_key, ip) values ($1, $2)", [key(), address])
    const plain = key()
    await db.query("insert into sms_sends (phone_key, ip) values ($1, $2)", [plain, address])
    expect(await authorize(plain)).toBe('ip_daily')
    await db.query(
      `insert into sms_sends (phone_key, ip, requested_at, sent_at)
       select encode(sha256(gen_random_uuid()::text::bytea), 'hex'), $1, now() - interval '1 hour', now() - interval '1 hour' from generate_series(1, 139)`,
      [address],
    )
    expect(await sms(address, slug)).toBe('ip_daily')
  })

  it('a personal partner, a paused org, an org with its affiliate switch off, the program off or junk keep the site-wide limits', async () => {
    const personal = await promoter(db)
    const paused = await orgSlug()
    await db.query("update orgs set status='suspended' where id=$1", [paused.orgId])
    const off = await orgSlug()
    await db.query('update orgs set affiliate_enabled=false where id=$1', [off.orgId])
    const valid = await orgSlug()
    for (const slug of [personal.slug, paused.slug, off.slug, 'Not a slug!', 'nobody-here', null]) {
      expect(await row(db, 'select _signup_org_ref($1) as ok', [slug])).toEqual({ ok: false })
    }
    expect(await row(db, 'select _signup_org_ref($1) as ok', [valid.slug])).toEqual({ ok: true })
    await db.query('update affiliate_settings set enabled=false')
    expect(await row(db, 'select _signup_org_ref($1) as ok', [valid.slug])).toEqual({ ok: false })
    const address = ip()
    for (let i = 0; i < 5; i++) expect(await signup(address, valid.slug)).toBe('ok')
    expect(await signup(address, valid.slug)).toBe('ip_hourly')
  })

  it('the org limit is never stricter than the site-wide one', async () => {
    const { slug } = await orgSlug()
    await setSetting('signup_request_ip_hourly', 8)
    await setSetting('signup_request_ip_hourly_partner', 2)
    const address = ip()
    for (let i = 0; i < 8; i++) expect(await signup(address, slug)).toBe('ok')
    expect(await signup(address, slug)).toBe('ip_hourly')
  })

  it('admin_set_system_setting takes 1..10000 for each limit, from an unbanned admin only', async () => {
    for (const name of KEYS) {
      expect(await save(name, 1)).toBeNull()
      expect(await save(name, 10000)).toBeNull()
      for (const bad of [0, 10001, 2.5, '5', null, -1]) expect(await save(name, bad)).toContain('INVALID_INPUT')
    }
    const someone = await createUser(db)
    expect(await save('sms_ip_daily', 60, someone)).toContain('NOT_ADMIN')
    await db.query('update profiles set banned_at=now() where id=$1', [actor])
    expect(await save('sms_ip_daily', 60)).toContain('NOT_ADMIN')
  })
})

describe('through PostgREST', () => {
  const service = serviceSupabase()

  it('resolves both the two- and the three-argument calls (no overload ambiguity)', async () => {
    const two = await service.rpc('signup_request', { p_email_key: emailKey(`${key()}@example.test`), p_ip: null })
    expect(two).toMatchObject({ data: 'ok', error: null })
    const three = await service.rpc('signup_request', { p_email_key: emailKey(`${key()}@example.test`), p_ip: null, p_ref_slug: 'nobody-here' })
    expect(three).toMatchObject({ data: 'ok', error: null })
    const smsTwo = await service.rpc('sms_request_send', { p_phone_key: key(), p_ip: null })
    expect(smsTwo).toMatchObject({ data: 'ok', error: null })
    const smsThree = await service.rpc('sms_request_send', { p_phone_key: key(), p_ip: null, p_ref_slug: null })
    expect(smsThree).toMatchObject({ data: 'ok', error: null })
  })

  it('the new functions are closed to the browser roles', async () => {
    const anon = anonSupabase()
    for (const [fn, args] of [
      ['signup_request', { p_email_key: key(), p_ip: null, p_ref_slug: null }],
      ['sms_request_send', { p_phone_key: key(), p_ip: null, p_ref_slug: null }],
      ['signup_ip_limits', {}],
      ['_signup_org_ref', { p_slug: 'x' }],
    ] as const) {
      expect((await anon.rpc(fn, args)).error).not.toBeNull()
    }
  })
})
