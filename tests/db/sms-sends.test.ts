import { randomBytes, randomUUID } from 'node:crypto'

import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { listSignupClusters, searchUsers } from '@/core/admin'
import { authorizeSmsSend, releaseSmsSend, requestSmsSend } from '@/core/auth/phone'

import { connectAdmin } from './helpers'
import { anonSupabase, serviceSupabase } from './supabase-env'

// T63: the SMS code limits (0440, 0441) and phone accounts in /admin/users (0442). Keys and IPs
// are random per test; numbers are in the 140 IoT data-only range, never a person's.

let db: Client
const service = serviceSupabase()
const key = () => randomBytes(32).toString('hex')
const ip = () => `198.18.${randomBytes(1)[0]}.${randomBytes(1)[0]}`
const phone = () => `86140${String(randomBytes(4).readUInt32BE() % 100_000_000).padStart(8, '0')}`

// Moves a number's rows back in time instead of waiting.
const age = (phoneKey: string, seconds: number) =>
  db.query(
    `update public.sms_sends set requested_at = requested_at - make_interval(secs => $2),
            sent_at = sent_at - make_interval(secs => $2) where phone_key = $1`,
    [phoneKey, seconds],
  )
const rowsOf = async (phoneKey: string) =>
  (await db.query<{ sent: boolean }>('select sent_at is not null as sent from public.sms_sends where phone_key = $1 order by id', [phoneKey])).rows

beforeAll(async () => {
  db = await connectAdmin()
})
afterAll(async () => {
  await db.end()
})

describe('sms_request_send (the server action)', () => {
  it('allows one code per number per 60 seconds', async () => {
    const k = key()
    expect(await requestSmsSend(service, k, ip())).toBe('ok')
    expect(await requestSmsSend(service, k, ip())).toBe('phone_cooldown')
    await age(k, 61)
    expect(await requestSmsSend(service, k, ip())).toBe('ok')
  })

  it('allows 5 per number in 24 hours, then refuses until the oldest is a day old', async () => {
    const k = key()
    for (let i = 0; i < 5; i++) {
      expect(await requestSmsSend(service, k, ip())).toBe('ok')
      await age(k, 61)
    }
    expect(await requestSmsSend(service, k, ip())).toBe('phone_daily')
    await age(k, 24 * 60 * 60)
    expect(await requestSmsSend(service, k, ip())).toBe('ok')
  })

  it('allows 20 per IP in 24 hours, whatever the numbers', async () => {
    const address = ip()
    await db.query('delete from public.sms_sends where ip = $1', [address])
    for (let i = 0; i < 20; i++) expect(await requestSmsSend(service, key(), address)).toBe('ok')
    expect(await requestSmsSend(service, key(), address)).toBe('ip_daily')
    expect(await requestSmsSend(service, key(), null)).toBe('ok')
  })

  it('refuses a key that is not a sha256 hex digest', async () => {
    await expect(requestSmsSend(service, '14000000001', null)).rejects.toThrow()
  })
})

describe('sms_authorize_send (the Send SMS hook)', () => {
  it('sends only against a fresh unsent request, once', async () => {
    const k = key()
    expect(await authorizeSmsSend(service, k)).toBe('no_request')
    await requestSmsSend(service, k, ip())
    expect(await authorizeSmsSend(service, k)).toBe('ok')
    expect(await rowsOf(k)).toEqual([{ sent: true }])
    expect(await authorizeSmsSend(service, k)).toBe('no_request')
  })

  it('refuses a request older than 2 minutes', async () => {
    const k = key()
    await requestSmsSend(service, k, ip())
    await age(k, 121)
    expect(await authorizeSmsSend(service, k)).toBe('no_request')
  })

  it('counts sent codes per number and per IP again before any provider is called', async () => {
    const k = key()
    await db.query(
      `insert into public.sms_sends (phone_key, requested_at, sent_at)
       select $1, now() - interval '1 hour', now() - interval '1 hour' from generate_series(1, 5)`,
      [k],
    )
    await db.query("insert into public.sms_sends (phone_key) values ($1)", [k])
    expect(await authorizeSmsSend(service, k)).toBe('phone_daily')

    const address = ip()
    await db.query(
      `insert into public.sms_sends (phone_key, ip, requested_at, sent_at)
       select encode(sha256(gen_random_uuid()::text::bytea), 'hex'), $1, now() - interval '1 hour', now() - interval '1 hour' from generate_series(1, 20)`,
      [address],
    )
    const other = key()
    await db.query('insert into public.sms_sends (phone_key, ip) values ($1, $2)', [other, address])
    expect(await authorizeSmsSend(service, other)).toBe('ip_daily')
  })
})

describe('sms_release_send', () => {
  it('drops the newest unsent request so a failed check does not count, and keeps sent ones', async () => {
    const k = key()
    await requestSmsSend(service, k, ip())
    await releaseSmsSend(service, k)
    expect(await rowsOf(k)).toEqual([])
    expect(await requestSmsSend(service, k, ip())).toBe('ok')
    await authorizeSmsSend(service, k)
    await releaseSmsSend(service, k)
    expect(await rowsOf(k)).toEqual([{ sent: true }])
  })
})

describe('sms_sends is private', () => {
  it('anon cannot call the functions or read the table', async () => {
    const anon = anonSupabase()
    for (const [fn, args] of [
      ['sms_request_send', { p_phone_key: key(), p_ip: null }],
      ['sms_authorize_send', { p_phone_key: key() }],
      ['sms_release_send', { p_phone_key: key() }],
    ] as const) {
      const { error } = await anon.rpc(fn, args)
      expect(error?.message).toMatch(/permission denied/)
    }
    const { data } = await anon.from('sms_sends').select('id').limit(1)
    expect(data ?? []).toEqual([])
  })
})

describe('phone accounts in /admin/users (0442)', () => {
  let user: string
  let number: string
  beforeAll(async () => {
    user = randomUUID()
    number = phone()
    await db.query(
      "insert into auth.users (id, phone, phone_confirmed_at, aud, role) values ($1, $2, now(), 'authenticated', 'authenticated')",
      [user, number],
    )
  })

  it('finds an account with no email by its number, typed with +86 and spaces', async () => {
    const typed = `+86 ${number.slice(2, 5)} ${number.slice(5, 9)} ${number.slice(9)}`
    const rows = await searchUsers(service, typed)
    expect(rows.map((row) => row.id)).toEqual([user])
    expect(rows[0]).toMatchObject({ email: null, phone: number })
    expect((await searchUsers(service, number.slice(-6))).map((row) => row.id)).toContain(user)
  })

  it('does not match on fewer than 4 digits', async () => {
    expect((await searchUsers(service, '140')).map((row) => row.id)).not.toContain(user)
  })

  it('names the phone of each member of a same-IP cluster', async () => {
    const address = ip()
    const members = [user, randomUUID(), randomUUID()]
    for (const id of members.slice(1)) {
      await db.query("insert into auth.users (id, phone, aud, role) values ($1, $2, 'authenticated', 'authenticated')", [id, phone()])
    }
    await db.query('update public.profiles set signup_ip = $2 where id = any($1)', [members, address])
    const cluster = (await listSignupClusters(service, 1)).find((row) => row.ip === address)
    expect(cluster?.members.find((member) => member.id === user)).toMatchObject({ email: null, phone: number })
  })
})
