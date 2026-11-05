import { randomUUID } from 'node:crypto'

import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { loadDashboardStats, type DashboardStats } from '@/core/admin'

import { connectAdmin, createUser } from './helpers'
import { anonSupabase } from './supabase-env'

// T23: admin_dashboard_stats against counts written straight in SQL, both read in one
// repeatable-read snapshot so parallel test files cannot move the numbers in between.

let db: Client
const DAY = 24 * 60 * 60 * 1000

async function insertJob(user: string, status: 'succeeded' | 'failed' | 'running', at: Date, provider: string, resolution: string) {
  await db.query(
    `insert into public.generation_jobs
       (id, user_id, module, template_id, inputs, provider, source, status, visibility, credits_cost, credit_pool,
        output_key, error_code, created_at, finished_at)
     values ($1, $2, 'image', 'freeform', $3, $4, 'web', $5, 'public', 2, 'free', $6, $7, $8, $9)`,
    [
      randomUUID(),
      user,
      JSON.stringify({ resolution }),
      provider,
      status,
      status === 'succeeded' ? 'outputs/x.png' : null,
      status === 'failed' ? 'GENERATION_FAILED' : null,
      at,
      status === 'running' ? null : new Date(at.getTime() + 1000),
    ],
  )
}

async function insertLedger(user: string, kind: string, pool: string, delta: number, at: Date) {
  await db.query(
    `insert into public.credit_ledger (user_id, pool, kind, delta, balance_after, reason, idempotency_key, created_at)
     values ($1, $2, $3, $4, 100, 'dashboard test', $5, $6)`,
    [user, pool, kind, delta, randomUUID(), at],
  )
}

beforeAll(async () => {
  db = await connectAdmin()
  const user = await createUser(db)
  const now = Date.now()
  await insertJob(user, 'succeeded', new Date(now - 60_000), 'env/gpt-image-2', '2k')
  await insertJob(user, 'failed', new Date(now - 3 * DAY), 'env/gpt-image-2', '1k')
  await insertJob(user, 'running', new Date(now - 10 * DAY), 'openai-image', '1k')
  await insertLedger(user, 'reserve', 'paid', -4, new Date(now - 60_000))
  await insertLedger(user, 'refund', 'free', 2, new Date(now - 3 * DAY))
  await insertLedger(user, 'reserve', 'free', -2, new Date(now - 3 * DAY))
  await insertLedger(user, 'purchase', 'paid', 100, new Date(now - 2 * DAY))
  // A repeat buyer: an older purchase means this window's purchase is not a new paying user.
  const repeat = await createUser(db)
  await insertLedger(repeat, 'purchase', 'paid', 100, new Date(now - 80 * DAY))
  await insertLedger(repeat, 'purchase', 'paid', 100, new Date(now - DAY))
})

afterAll(async () => {
  await db.end()
})

const DIRECT = `
  with b as (
    select date_trunc('day', now() at time zone 'Asia/Shanghai') at time zone 'Asia/Shanghai' as today
  ), w as (
    select 'today' as key, today as since from b
    union all select '7d', today - interval '6 days' from b
    union all select 'period', today - interval '29 days' from b
  )
  select w.key,
    (select count(*) from public.profiles where created_at >= w.since)::int as signups,
    (select count(*) from public.generation_jobs where created_at >= w.since)::int as jobs,
    (select count(*) from public.generation_jobs where created_at >= w.since and status = 'succeeded')::int as succeeded,
    (select count(*) from public.generation_jobs where created_at >= w.since and status = 'failed')::int as failed,
    (select coalesce(-sum(delta), 0) from public.credit_ledger
      where created_at >= w.since and kind in ('reserve', 'refund') and pool = 'free')::int as free_credits_used,
    (select coalesce(-sum(delta), 0) from public.credit_ledger
      where created_at >= w.since and kind in ('reserve', 'refund') and pool = 'paid')::int as paid_credits_used,
    (select count(*) from (select user_id from public.credit_ledger where kind = 'purchase'
       group by user_id having min(created_at) >= w.since) f)::int as new_paying_users
  from w`

async function snapshot(): Promise<{ stats: DashboardStats; direct: Record<string, unknown>[] }> {
  await db.query('begin isolation level repeatable read')
  try {
    const { rows } = await db.query<{ s: unknown }>('select public.admin_dashboard_stats(30) as s')
    const direct = (await db.query(DIRECT)).rows
    const stats = await loadDashboardStats({ rpc: async () => ({ data: rows[0]!.s, error: null }) })
    return { stats, direct }
  } finally {
    await db.query('commit')
  }
}

describe('admin_dashboard_stats', () => {
  it('matches direct counts for today, 7 days and 30 days', async () => {
    const { stats, direct } = await snapshot()
    for (const expected of direct) {
      const { key, ...counts } = expected
      expect(stats.windows.find((window) => window.key === key)).toMatchObject(counts)
    }
  })

  it('returns a 30-day trend whose totals equal the period window', async () => {
    const { stats } = await snapshot()
    const period = stats.windows.find((window) => window.key === 'period')!
    expect(stats.trend).toHaveLength(30)
    expect(stats.trend.reduce((sum, day) => sum + day.jobs, 0)).toBe(period.jobs)
    expect(stats.trend.reduce((sum, day) => sum + day.succeeded, 0)).toBe(period.succeeded)
    expect(stats.timezone).toBe('Asia/Shanghai')
  })

  it('breaks the period down by model and resolution', async () => {
    const { stats } = await snapshot()
    expect(stats.by_model).toEqual(expect.arrayContaining([expect.objectContaining({ model: 'gpt-image-2', resolution: '2k' })]))
    expect(stats.by_model).toEqual(expect.arrayContaining([expect.objectContaining({ model: 'openai-image', resolution: '1k' })]))
    const total = stats.by_model.reduce((sum, row) => sum + row.jobs, 0)
    expect(total).toBe(stats.windows.find((window) => window.key === 'period')!.jobs)
  })

  it('refuses a window outside 7..90 days and any client role', async () => {
    await expect(db.query('select public.admin_dashboard_stats(3)')).rejects.toThrow(/INVALID_INPUT/)
    const { error } = await anonSupabase().rpc('admin_dashboard_stats', { p_days: 30 })
    expect(error?.message).toMatch(/permission denied/)
  })
})
