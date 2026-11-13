import { randomUUID } from 'node:crypto'

import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { connectAdmin, createUser } from './helpers'
import { anonSupabase } from './supabase-env'

// admin_daily_costs_by_provider (1360): our cost per UTC day split by who bills us. Another file
// may write jobs in parallel, so each check looks at the seeded day minus a snapshot taken first.

let db: Client
let user: string
const DAY = 24 * 60 * 60 * 1000
const arkId = randomUUID()
const orId = randomUUID()
// Ten days back: no other fixture seeds that UTC day on purpose.
const at = new Date(Date.now() - 10 * DAY)
const day = at.toISOString().slice(0, 10)

type Row = { day: string; provider: string; cost_usd: number; cost_cny: number; costed: number; uncosted: number; no_usage: number; test_cost_usd: number; test_runs: number }

async function byProvider(): Promise<Row[]> {
  const { rows } = await db.query<{ s: Row[] }>('select public.admin_daily_costs_by_provider(30) as s')
  return rows[0]!.s.filter((row) => row.day === day)
}

async function insertJob(provider: string, usage: object | null, cost: number | null) {
  await db.query(
    `insert into public.generation_jobs
       (id, user_id, module, template_id, inputs, provider, source, status, visibility, credits_cost, credit_pool,
        output_key, created_at, finished_at, provider_usage, cost_usd)
     values ($1, $2, 'image', 'freeform', '{}', $3, 'web', 'succeeded', 'public', 2, 'free', 'outputs/x.png', $4, $5, $6, $7)`,
    [randomUUID(), user, provider, at, new Date(at.getTime() + 1000), usage === null ? null : JSON.stringify(usage), cost],
  )
}

let before: Row[] = []

beforeAll(async () => {
  db = await connectAdmin()
  user = await createUser(db)
  await db.query(`insert into public.ai_providers (id, module, adapter, label, base_url, model, resolutions)
    values ($1, 'image', 'ark_images', 'costs fixture ark', 'https://ark.cn-beijing.volces.com/api/v3', 'seedream-fixture', '{1k}')`, [arkId])
  await db.query(`insert into public.ai_providers (id, module, adapter, label, base_url, model, resolutions)
    values ($1, 'image', 'openrouter_images', 'costs fixture or', 'https://openrouter.ai/api/v1', 'fixture/or', '{1k}')`, [orId])
  before = await byProvider()
  await insertJob(`${arkId}/seedream-fixture`, { generated_images: 1, input_images: 1, list_cost_cny: 0.18, cny_per_usd: 6.72, list_cost_usd: 0.0268 }, 0.0268)
  await insertJob(`${orId}/fixture/or`, null, null)
  await insertJob('env/gpt-image-fixture', { input_text_tokens: 1, output_tokens: 2 }, 0.1)
  // A tag whose row is gone falls back to the usage shape.
  await insertJob(`${randomUUID()}/gone`, { cost: 0.03, prompt_tokens: 1 }, 0.03)
})

afterAll(async () => {
  await db.query('delete from public.ai_providers where id = any($1)', [[arkId, orId]])
  await db.end()
})

const delta = (after: Row[], provider: string, key: keyof Row) => {
  const pick = (rows: Row[]) => Number(rows.find((row) => row.provider === provider)?.[key] ?? 0)
  return pick(after) - pick(before)
}

describe('admin_daily_costs_by_provider (1360)', () => {
  it('attributes jobs by the provider row, else by usage shape, with Ark in CNY too', async () => {
    const after = await byProvider()
    expect(delta(after, 'ark', 'cost_usd')).toBeCloseTo(0.0268, 6)
    expect(delta(after, 'ark', 'cost_cny')).toBeCloseTo(0.18, 6)
    expect(delta(after, 'ark', 'costed')).toBe(1)
    expect(delta(after, 'openrouter', 'no_usage')).toBe(1)
    expect(delta(after, 'openrouter', 'cost_usd')).toBeCloseTo(0.03, 6)
    expect(delta(after, 'openai', 'cost_usd')).toBeCloseTo(0.1, 6)
    expect(delta(after, 'openai', 'costed')).toBe(1)
  })

  it('refuses a bad window and client roles', async () => {
    await expect(db.query('select public.admin_daily_costs_by_provider(0)')).rejects.toThrow(/INVALID_INPUT/)
    expect((await anonSupabase().rpc('admin_daily_costs_by_provider', { p_days: 30 })).error?.message).toMatch(/permission denied/)
  })
})
