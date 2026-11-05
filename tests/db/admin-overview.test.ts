import { randomUUID } from 'node:crypto'

import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { grantCredits } from '@/core/billing'
import { reserveJob } from '@/core/jobs'

import { connectAdmin, createUser, localSupabase, profileOf, serviceClient } from './helpers'

// T20: admin.users_overview (ARCHITECTURE §10) and the tightened client grants on
// templates / profiles. Existing RLS behaviour is covered by rls.test.ts and friends.

let db: Client
let user: string
let email: string

beforeAll(async () => {
  db = await connectAdmin()
  user = await createUser(db, { credits: 7, freeCredits: 0, paidUntil: new Date('2027-01-01T00:00:00Z') })
  const { rows } = await db.query<{ email: string }>('select email from auth.users where id = $1', [user])
  email = rows[0]!.email
  // What GoTrue fills on a real signup; the test helper's bare insert leaves them empty.
  await db.query(
    `update auth.users
        set created_at = now(),
            raw_app_meta_data = '{"provider": "email", "providers": ["google", "email"]}'::jsonb
      where id = $1`,
    [user],
  )
  const service = serviceClient()
  await grantCredits(service, { userId: user, amount: 3, reason: 'overview test', idempotencyKey: randomUUID(), pool: 'free' })
  for (let i = 0; i < 2; i++) {
    await reserveJob(service, {
      jobId: randomUUID(),
      userId: user,
      module: 'image',
      // freeform at Standard: reserve_credits charges its '1k' price, 2 (T16).
      templateId: 'freeform',
      source: 'web',
    })
  }
})

afterAll(async () => {
  await db.end()
})

// Runs a query as a database role inside a rolled-back transaction, the way PostgREST does.
async function asRole<T>(role: 'anon' | 'authenticated' | 'service_role', run: () => Promise<T>) {
  await db.query('begin')
  try {
    await db.query(`set local role ${role}`)
    if (role === 'authenticated') {
      await db.query("select set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({ sub: user, role: 'authenticated' }),
      ])
    }
    return await run()
  } finally {
    await db.query('rollback')
  }
}

const readOverview = () => db.query('select * from admin.users_overview limit 1')

describe('admin.users_overview', () => {
  it.each(['anon', 'authenticated'] as const)('is not readable by %s', async (role) => {
    await expect(asRole(role, readOverview)).rejects.toThrow(/permission denied/)
  })

  it.each([
    ['anon', () => localSupabase().anonKey],
    ['service_role', () => localSupabase().serviceRoleKey],
  ])('is not reachable through the Data API, even with the %s key', async (_name, key) => {
    const { apiUrl } = localSupabase()
    const response = await fetch(`${apiUrl}/rest/v1/users_overview?select=*`, {
      headers: { apikey: key(), Authorization: `Bearer ${key()}`, 'Accept-Profile': 'admin' },
    })
    expect(response.ok).toBe(false)
    const body = (await response.json()) as { message?: string }
    expect(body.message).toMatch(/schema/i)
  })

  it('lets service_role find a user by email with the whole row', async () => {
    const rows = await asRole('service_role', async () =>
      (await db.query('select * from admin.users_overview where email = $1', [email])).rows,
    )
    expect(rows).toHaveLength(1)
    const row = rows[0]
    const profile = await profileOf(db, user)
    expect(row).toMatchObject({
      id: user,
      email,
      provider: 'email, google',
      role: 'user',
      credits: profile.credits,
      free_credits: profile.free_credits,
      generation_count: 2,
      banned_at: null,
    })
    // Two 2-credit reservations against 7 paid + 3 free.
    expect(row.credits + row.free_credits).toBe(6)
    expect(row.paid_until).toEqual(new Date('2027-01-01T00:00:00Z'))
    expect(row.created_at).toBeInstanceOf(Date)
    expect(row.last_generation_at).toBeInstanceOf(Date)
  })

  it('supports partial email search', async () => {
    const rows = await asRole('service_role', async () =>
      (await db.query('select id from admin.users_overview where email ilike $1', [`%${user.slice(0, 13)}%`])).rows,
    )
    expect(rows.map((row) => row.id)).toEqual([user])
  })

  it('shows zero generations for a fresh user', async () => {
    const fresh = await createUser(db)
    const { rows } = await db.query(
      'select generation_count, last_generation_at from admin.users_overview where id = $1',
      [fresh],
    )
    expect(rows).toEqual([{ generation_count: 0, last_generation_at: null }])
  })
})

describe('client grants on templates and profiles', () => {
  const privileges = async (role: string, table: string) => {
    const { rows } = await db.query<{ privilege_type: string }>(
      `select privilege_type from information_schema.role_table_grants
        where grantee = $1 and table_schema = 'public' and table_name = $2
        order by privilege_type`,
      [role, table],
    )
    return rows.map((row) => row.privilege_type)
  }

  it.each([
    ['anon', 'templates', ['SELECT']],
    ['authenticated', 'templates', ['SELECT']],
    ['anon', 'profiles', []],
    ['authenticated', 'profiles', ['SELECT']],
  ])('%s on %s is exactly %j', async (role, table, expected) => {
    expect(await privileges(role, table)).toEqual(expected)
  })

  it.each(['anon', 'authenticated'] as const)('%s cannot truncate templates', async (role) => {
    await expect(asRole(role, () => db.query('truncate public.templates cascade'))).rejects.toThrow(
      /permission denied/,
    )
  })

  it('anon still reads active templates', async () => {
    const { rows } = await asRole('anon', () => db.query('select id from public.templates'))
    expect(rows.length).toBeGreaterThan(0)
  })
})
