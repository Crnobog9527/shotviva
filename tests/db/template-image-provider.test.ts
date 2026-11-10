import { randomUUID } from 'node:crypto'

import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { connectAdmin, createUser } from './helpers'

let db: Client
const image = randomUUID()
const decision = randomUUID()
const template = {
  id: `t92-${randomUUID().slice(0, 8)}`, name: 'T92', category: 'pets',
  credits_cost: { '1k': 2, '2k': 4, '3k': 6 },
}

function save(prompt: Record<string, unknown>) {
  return db.query('select public.admin_upsert_template($1, $2)', [template, { body: 'fixture', ...prompt }])
}

async function providerId() {
  return (await db.query('select provider_id from public.template_prompts where template_id = $1', [template.id])).rows[0]?.provider_id
}

beforeAll(async () => {
  db = await connectAdmin()
  await db.query(`insert into public.ai_providers (id, label, module, adapter, model, resolutions)
    values ($1, 'T92', 'image', 'openrouter_images', 'vendor/model', '{1k}'),
           ($2, 'T92 decision', 'decision', 'openai_responses', 'fixture', default)`, [image, decision])
})

afterAll(async () => {
  await db.query('delete from public.templates where id = $1', [template.id])
  await db.query('delete from public.ai_providers where id = any($1)', [[image, decision]])
  await db.end()
})

describe('per-template image provider', () => {
  it('rejects invalid tiers and decision adapters for OpenRouter rows', async () => {
    const defaults = await db.query('select resolutions from public.ai_providers where id = $1', [decision])
    expect(defaults.rows[0]?.resolutions).toEqual(['1k', '2k', '3k'])
    for (const tiers of [[], ['4k'], [null]]) {
      await expect(db.query('update public.ai_providers set resolutions = $2 where id = $1', [image, tiers])).rejects.toThrow(/check constraint/)
    }
    await expect(db.query("update public.ai_providers set module = 'decision' where id = $1", [image])).rejects.toThrow(/check constraint/)
  })

  it('accepts an inactive image model, preserves omitted fields, and only allows image providers', async () => {
    await save({ provider_id: image })
    await save({})
    expect(await providerId()).toBe(image)
    for (const invalid of [decision, randomUUID()]) {
      await expect(save({ provider_id: invalid })).rejects.toThrow(/PROVIDER_NOT_IMAGE/)
      expect(await providerId()).toBe(image)
    }
    await expect(db.query("update public.ai_providers set module = 'decision', adapter = 'openai_responses' where id = $1", [image]))
      .rejects.toThrow(/PROVIDER_REFERENCED/)
    await expect(db.query('select public.admin_delete_provider($1)', [image])).rejects.toThrow(/PROVIDER_REFERENCED/)
    await expect(db.query('delete from public.ai_providers where id = $1', [image])).rejects.toThrow(/foreign key/)
    await save({ provider_id: null })
    expect(await providerId()).toBeNull()
    await db.query('select public.admin_delete_provider($1)', [image])
  })

  it.each(['anon', 'authenticated'])('refuses %s saves, deletes and direct writes', async (role) => {
    for (const sql of [
      "select public.admin_upsert_template('{}', '{}')", 'select public.admin_delete_provider(gen_random_uuid())',
      'update public.template_prompts set provider_id = null', "update public.ai_providers set resolutions = '{1k}'",
    ]) {
      await db.query('begin')
      try {
        await db.query(`set local role ${role}`)
        await expect(db.query(sql)).rejects.toThrow(/permission denied/)
      } finally {
        await db.query('rollback')
      }
    }
  })
})

it('groups the same model by provider and preserves nested model names', async () => {
  await db.query('begin')
  try {
    const tags = [`${image}/vendor/model`, `env/vendor/model`]
    const user = await createUser(db)
    for (const tag of tags) {
      await db.query(`insert into public.generation_jobs
        (id, user_id, module, template_id, inputs, provider, source, status, visibility, credits_cost, credit_pool, cost_usd, provider_usage)
        values ($1, $2, 'image', 'freeform', '{}', $3, 'web', 'running', 'public', 2, 'free', 0.02, '{"cost":0.019}')`, [randomUUID(), user, tag])
    }
    const { rows } = await db.query("select public.admin_dashboard_stats(7)->'by_model' as models, public.admin_daily_costs(1) as days")
    expect(rows[0].models).toEqual(expect.arrayContaining([image, 'env'].map((provider) => expect.objectContaining({ provider, model: 'vendor/model' }))))
    expect(rows[0].days[0].has_openrouter).toBe(true)
  } finally {
    await db.query('rollback')
  }
})

it('keeps both test models in costs after the runs are pruned, including charged failures', async () => {
  await db.query('begin')
  try {
    const tags = [`${image}/vendor/model`, `env/t92-${randomUUID()}`]
    const costs = [0.03165, 0.05]
    for (const [i, tag] of tags.entries()) {
      const id = randomUUID()
      await db.query(`insert into public.admin_test_runs (id, template_id, kind, batch_id, resolution, provider, estimate_usd)
        values ($1, 'freeform', 'generate', $1, '1k', $2, 0.06)`, [id, tag])
      await db.query("insert into public.admin_test_spend (run_id, template_id, estimate_usd) values ($1, 'freeform', 0.06)", [id])
      const usage = i === 0 ? { cost: 0.03, completion_tokens: 34 } : { output_tokens: 50 }
      await db.query("select public.admin_finish_test_run($1, 'failed', null, 'PROVIDER_FAILED', $2, $3, 1)", [id, usage, costs[i]])
      await db.query('delete from public.admin_test_runs where id = $1', [id])
    }
    const { rows } = await db.query('select public.admin_test_daily_costs(1) as days')
    expect(rows[0].days[0]).toMatchObject({ has_openrouter: true, by_provider: expect.arrayContaining(
      tags.map((provider, i) => ({ provider, cost_usd: costs[i], runs: 1 })),
    ) })
  } finally {
    await db.query('rollback')
  }
})

it.each([{ completion_tokens: 34 }, { cost: null, generation_id: 'gen-fixture' }, { cost: 0, is_byok: true }])(
  'retains the reserved budget once for a failed run with unresolved usage %j', async (usage) => {
  await db.query('begin')
  try {
    const id = randomUUID()
    await db.query(`insert into public.admin_test_runs (id, template_id, kind, batch_id, resolution, provider, estimate_usd)
      values ($1, 'freeform', 'generate', $1, '1k', $2, 0.06)`, [id, `${image}/vendor/model`])
    await db.query("insert into public.admin_test_spend (run_id, template_id, estimate_usd) values ($1, 'freeform', 0.06)", [id])
    const finish = "select public.admin_finish_test_run($1, 'failed', null, 'PROVIDER_FAILED', $2, null, 1)"
    await db.query(finish, [id, usage])
    await db.query(finish, [id, {}])
    const { rows } = await db.query('select counted_usd, cost_usd, has_openrouter from public.admin_test_spend where run_id = $1', [id])
    expect(rows[0]).toEqual({ counted_usd: '0.060000', cost_usd: null, has_openrouter: true })
  } finally {
    await db.query('rollback')
  }
})
