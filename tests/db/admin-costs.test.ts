import { randomUUID } from 'node:crypto'

import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { clearCostSettings, loadAdminKeyStatus, loadDashboardStats, loadOurDailyCosts, saveCostSettings } from '@/core/admin'
import { logger } from '@/core/logger'

import { connectAdmin, createUser } from './helpers'
import { anonSupabase, serviceSupabase } from './supabase-env'

// T33 against the real functions: real cost in admin_dashboard_stats (0283), our per-UTC-day
// totals for /admin/costs (0284) and the OpenAI Admin key in Vault (0282). Sums are compared
// with direct SQL in one repeatable-read snapshot, since other files write jobs in parallel.

let db: Client
const DAY = 24 * 60 * 60 * 1000
const ADMIN_KEY = 'sk-admin-t33-secret-0123456789abcd'

type Seed = { status: 'succeeded' | 'failed'; at: Date; usage: object | null; cost: number | null; resolution?: string }

async function insertJob(user: string, seed: Seed) {
  await db.query(
    `insert into public.generation_jobs
       (id, user_id, module, template_id, inputs, provider, source, status, visibility, credits_cost, credit_pool,
        output_key, error_code, created_at, finished_at, provider_usage, cost_usd)
     values ($1, $2, 'image', 'freeform', $3, 'env/gpt-image-t33', 'web', $4, 'public', 2, 'free', $5, $6, $7, $8, $9, $10)`,
    [
      randomUUID(),
      user,
      JSON.stringify({ resolution: seed.resolution ?? '1k' }),
      seed.status,
      seed.status === 'succeeded' ? 'outputs/x.png' : null,
      seed.status === 'failed' ? 'PROVIDER_FAILED' : null,
      seed.at,
      new Date(seed.at.getTime() + 1000),
      seed.usage === null ? null : JSON.stringify(seed.usage),
      seed.cost,
    ],
  )
}

beforeAll(async () => {
  db = await connectAdmin()
  const user = await createUser(db)
  const now = Date.now()
  const usage = { input_text_tokens: 10, input_image_tokens: 20, output_tokens: 30 }
  await insertJob(user, { status: 'succeeded', at: new Date(now - 2 * DAY), usage, cost: 0.12 })
  await insertJob(user, { status: 'failed', at: new Date(now - 2 * DAY), usage, cost: 0.03 })
  await insertJob(user, { status: 'succeeded', at: new Date(now - 3 * DAY), usage, cost: null })
  await insertJob(user, { status: 'succeeded', at: new Date(now - 4 * DAY), usage: null, cost: null, resolution: '2k' })
})

afterAll(async () => {
  await db.query("delete from vault.secrets where name in ('shotviva.openai_admin_key', 'shotviva.openai_costs_project')")
  await db.end()
})

async function inSnapshot<T>(work: () => Promise<T>): Promise<T> {
  await db.query('begin isolation level repeatable read')
  try {
    return await work()
  } finally {
    await db.query('commit')
  }
}

const rpcOf = (data: unknown) => ({ rpc: async () => ({ data, error: null }) })

describe('admin_dashboard_stats real cost (T33)', () => {
  it('sums cost_usd, counts uncosted jobs and gives pre-T33 successes per resolution', async () => {
    const { stats, direct } = await inSnapshot(async () => {
      const { rows } = await db.query<{ s: unknown }>('select public.admin_dashboard_stats(30) as s')
      const since = "date_trunc('day', now() at time zone 'Asia/Shanghai') at time zone 'Asia/Shanghai' - interval '29 days'"
      const { rows: d } = await db.query<{ cost: string; uncosted: number; legacy_2k: number }>(
        `select coalesce(sum(cost_usd), 0) as cost,
                count(*) filter (where provider_usage is not null and cost_usd is null)::int as uncosted,
                count(*) filter (where status = 'succeeded' and provider_usage is null and cost_usd is null
                                   and coalesce(inputs ->> 'resolution', '1k') = '2k')::int as legacy_2k
           from public.generation_jobs where created_at >= ${since}`,
      )
      return { stats: await loadDashboardStats(rpcOf(rows[0]!.s)), direct: d[0]! }
    })
    const period = stats.windows.find((w) => w.key === 'period')!
    expect(period.cost_usd).toBeCloseTo(Number(direct.cost), 6)
    expect(period.uncosted).toBe(direct.uncosted)
    expect(period.legacy['2k'] ?? 0).toBe(direct.legacy_2k)
    expect(stats.trend.reduce((sum, day) => sum + day.cost_usd, 0)).toBeCloseTo(period.cost_usd, 6)
    expect(stats.by_model.reduce((sum, row) => sum + row.cost_usd, 0)).toBeCloseTo(period.cost_usd, 6)
    // The seeded model: one succeeded + one failed with cost, one uncosted, one pre-T33 success.
    const seeded = stats.by_model.filter((row) => row.model === 'gpt-image-t33')
    expect(seeded.reduce((sum, row) => sum + row.cost_usd, 0)).toBeGreaterThanOrEqual(0.15 - 1e-9)
    expect(seeded.find((row) => row.resolution === '2k')?.legacy).toBeGreaterThanOrEqual(1)
  })
})

describe('admin_daily_costs (T33)', () => {
  it('lists 30 UTC days, oldest first, matching direct sums', async () => {
    const { days, direct } = await inSnapshot(async () => {
      const result = await loadOurDailyCosts(rpcOf((await db.query<{ s: unknown }>('select public.admin_daily_costs(30) as s')).rows[0]!.s))
      const { rows } = await db.query<{ day: string; cost: string }>(
        `select to_char(date_trunc('day', created_at at time zone 'UTC'), 'YYYY-MM-DD') as day, coalesce(sum(cost_usd), 0) as cost
           from public.generation_jobs
          where created_at >= date_trunc('day', now() at time zone 'UTC') at time zone 'UTC' - interval '29 days'
          group by 1`,
      )
      return { days: result, direct: rows }
    })
    expect(days).toHaveLength(30)
    expect(days[29]?.day).toBe(new Date().toISOString().slice(0, 10))
    expect(days[0]!.day < days[29]!.day).toBe(true)
    for (const row of direct) expect(days.find((d) => d.day === row.day)?.cost_usd).toBeCloseTo(Number(row.cost), 6)
  })

  it('refuses a bad window and client roles', async () => {
    await expect(db.query('select public.admin_daily_costs(0)')).rejects.toThrow(/INVALID_INPUT/)
    expect((await anonSupabase().rpc('admin_daily_costs', { p_days: 30 })).error?.message).toMatch(/permission denied/)
  })
})

describe('OpenAI Admin key in Vault (T33)', () => {
  it('stores the key, shows only its last four, and never logs it', async () => {
    const info = vi.spyOn(logger, 'info')
    const service = serviceSupabase()
    await saveCostSettings(service, randomUUID(), { apiKey: ` ${ADMIN_KEY}\n`, projectId: 'proj_T33abc' })
    expect(await loadAdminKeyStatus(service)).toEqual({ keyLast4: 'abcd', projectId: 'proj_T33abc' })
    const { data } = await service.rpc('openai_admin_key')
    expect(data).toEqual([{ api_key: ADMIN_KEY, project_id: 'proj_T33abc' }])
    expect(JSON.stringify(info.mock.calls)).not.toContain(ADMIN_KEY)
    info.mockRestore()
  })

  it('keeps the key when saved blank, clears the project, and deletes both on clear', async () => {
    const service = serviceSupabase()
    await saveCostSettings(service, randomUUID(), { apiKey: ADMIN_KEY, projectId: 'proj_T33abc' })
    await saveCostSettings(service, randomUUID(), { apiKey: '', projectId: '' })
    expect(await loadAdminKeyStatus(service)).toEqual({ keyLast4: 'abcd', projectId: null })
    await clearCostSettings(service, randomUUID())
    expect(await loadAdminKeyStatus(service)).toEqual({ keyLast4: null, projectId: null })
  })

  it('refuses malformed input before and inside SQL', async () => {
    const service = serviceSupabase()
    await expect(saveCostSettings(service, randomUUID(), { apiKey: 'short' })).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    await expect(saveCostSettings(service, randomUUID(), { apiKey: ADMIN_KEY, projectId: 'project 1' })).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    expect((await service.rpc('admin_set_openai_admin_key', { p_key: 'has space in it 0123456789' })).error?.message).toMatch(/PROVIDER_KEY_INVALID/)
    expect((await service.rpc('admin_set_openai_costs_project', { p_project_id: 'nope' })).error?.message).toMatch(/INVALID_INPUT/)
  })

  it('keeps every key function out of reach of client roles', async () => {
    for (const [fn, args] of [
      ['admin_set_openai_admin_key', { p_key: ADMIN_KEY }],
      ['admin_set_openai_costs_project', { p_project_id: 'proj_x' }],
      ['admin_openai_admin_key_status', {}],
      ['openai_admin_key', {}],
    ] as const) {
      expect((await anonSupabase().rpc(fn, args)).error?.message).toMatch(/permission denied/)
    }
  })
})
