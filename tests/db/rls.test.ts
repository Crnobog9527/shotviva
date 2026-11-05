import { randomUUID } from 'node:crypto'

import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { grantCredits } from '@/core/billing'
import { reserveJob } from '@/core/jobs'

import { anonClient, connectAdmin, createUser, serviceClient } from './helpers'

const PRIVATE_TABLES = ['credit_ledger', 'products', 'admin_audit_log']
const SERVICE_FUNCTIONS: Array<[string, Record<string, unknown>]> = [
  ['grant_credits', { p_user_id: randomUUID(), p_amount: 1, p_reason: 'x', p_idempotency_key: 'x' }],
  ['admin_adjust_credits', { p_user_id: randomUUID(), p_amount: 1, p_reason: 'x' }],
  ['apply_purchase', { p_user_id: randomUUID(), p_product_id: 'pass', p_event_id: 'x' }],
  ['confirm_job', { p_job_id: randomUUID(), p_output_key: 'x' }],
  ['refund_job', { p_job_id: randomUUID(), p_error_code: 'x' }],
  ['admin_ban_user', { p_user_id: randomUUID(), p_reason: 'x' }],
  ['is_paid', { p_user_id: randomUUID() }],
]

let db: Client
let owner: string
let stranger: string

beforeAll(async () => {
  db = await connectAdmin()
  owner = await createUser(db)
  stranger = await createUser(db)
  const service = serviceClient()
  await grantCredits(service, { userId: owner, amount: 2, reason: 'rls test', idempotencyKey: randomUUID(), pool: 'free' })
  await reserveJob(service, {
    jobId: randomUUID(),
    userId: owner,
    module: 'image',
    templateId: 'freeform',
    creditsCost: 1,
    source: 'web',
  })
})

afterAll(async () => {
  await db.end()
})

// Runs queries as a client role inside a rolled-back transaction, the way PostgREST does.
async function asRole<T>(role: 'anon' | 'authenticated', sub: string | null, run: () => Promise<T>) {
  await db.query('begin')
  try {
    await db.query(`set local role ${role}`)
    if (sub) {
      await db.query("select set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({ sub, role: 'authenticated' }),
      ])
    }
    return await run()
  } finally {
    await db.query('rollback')
  }
}

const count = async (table: string) => (await db.query(`select * from public.${table}`)).rowCount

describe('anon role', () => {
  it.each(PRIVATE_TABLES)('cannot read %s through PostgREST', async (table) => {
    const response = await anonClient().select(table)
    expect(response.ok).toBe(false)
  })

  it.each(SERVICE_FUNCTIONS)('cannot call %s through PostgREST', async (fn, args) => {
    const { error } = await anonClient().rpc(fn, args)
    expect(error).not.toBeNull()
  })

  it.each(['profiles', 'generation_jobs', ...PRIVATE_TABLES])('cannot read %s', async (table) => {
    await expect(asRole('anon', null, () => count(table))).rejects.toThrow(/permission denied/)
  })
})

describe('authenticated user', () => {
  it.each(PRIVATE_TABLES)('cannot read %s', async (table) => {
    await expect(asRole('authenticated', owner, () => count(table))).rejects.toThrow(/permission denied/)
  })

  it('cannot call reserve_credits for themselves', async () => {
    const call = () =>
      db.query(
        "select public.reserve_credits(gen_random_uuid(), $1, 'image', 'freeform', 1, 'web')",
        [owner],
      )
    await expect(asRole('authenticated', owner, call)).rejects.toThrow(/permission denied/)
  })

  it('sees only their own profile and jobs', async () => {
    const [profiles, jobs] = await asRole('authenticated', owner, async () => [
      (await db.query<{ id: string }>('select id from public.profiles')).rows,
      (await db.query<{ user_id: string }>('select user_id from public.generation_jobs')).rows,
    ])
    expect(profiles.map((row) => row.id)).toEqual([owner])
    expect(jobs.length).toBeGreaterThan(0)
    expect(jobs.every((row) => row.user_id === owner)).toBe(true)
  })

  it('cannot write their own balance or jobs', async () => {
    await expect(
      asRole('authenticated', owner, () =>
        db.query('update public.profiles set credits = 999 where id = $1', [owner]),
      ),
    ).rejects.toThrow(/permission denied/)
    await expect(
      asRole('authenticated', owner, () =>
        db.query("update public.generation_jobs set status = 'failed' where user_id = $1", [owner]),
      ),
    ).rejects.toThrow(/permission denied/)
  })

  it("does not see another user's profile", async () => {
    const rows = await asRole('authenticated', stranger, async () =>
      (await db.query('select id from public.profiles where id = $1', [owner])).rows,
    )
    expect(rows).toEqual([])
  })
})
