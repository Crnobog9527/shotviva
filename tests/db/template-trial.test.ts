import { createHash } from 'node:crypto'

import type { Client } from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { listAdminTemplates } from '@/core/admin/templates/repository'
import { ProviderError, type GenerationProvider } from '@/core/jobs'
import { loadTestBudget, saveTestBudget } from '@/modules/image'
import { parseBatch } from '../../scripts/template-apply/schema'
import { planCells, runIdOf } from '../../scripts/template-trial/cells'
import { ensureTestPhoto } from '../../scripts/template-trial/photos'
import { runAll, type RunContext } from '../../scripts/template-trial/runner'
import { jpeg, png } from '../fakes/images'
import { createMemoryStore } from '../fakes/memory-store'
import { seedTemplate } from './generation-fixtures'
import { connectAdmin, createUser } from './helpers'
import { serviceSupabase } from './supabase-env'
import { holdTestBudget } from './test-run-fixtures'

// `pnpm templates:trial` through the admin's own runTestGenerate (admin_test_runs, the daily
// budget) with an in-memory bucket and a fake provider: retries, resuming, only-what-changed and both
// budgets. No real model is called (AGENTS §7).

const service = serviceSupabase()
const PRICES = { inputTextPerM: 5, inputImagePerM: 8, outputPerM: 30 }
let db: Client
let admin: string
let release: () => Promise<void>
let templateId: string
// One bucket for the file, as on the test site: a photo listed once stays readable for later runs.
const bucket = createMemoryStore()

function provider(failFirst = 0) {
  let calls = 0
  const generate = vi.fn(async () => {
    calls++
    if (calls <= failFirst) throw new ProviderError('failed', 'upstream 503')
    return { bytes: await png(640, 800), contentType: 'image/png' as const, usage: { input_text_tokens: 100, input_image_tokens: 1000, output_tokens: 2000 } }
  })
  const fake: GenerationProvider = { id: 'fake-openai/gpt-image-2.6', prices: PRICES, generate }
  return { fake, generate }
}

// Today's spend plus what a test may still use (the budget is shared with other test files).
async function budgetLeft(usd: number) {
  const { spentUsd } = await loadTestBudget(service)
  await saveTestBudget(service, admin, Math.round((spentUsd + usd) * 100) / 100)
}

async function setup(options: { failFirst?: number; n?: number; budgetUsd?: number } = {}) {
  const r2 = bucket
  const p = provider(options.failFirst)
  const deps = { db: service, store: r2.store, provider: p.fake, providerTimeoutMs: 2_000, identityJudge: null }
  const bytes = await jpeg(1200, 1500)
  const photo = { bytes, hash: createHash('sha256').update(bytes).digest('hex') }
  const photoId = await ensureTestPhoto(deps, admin, photo)
  const items = parseBatch({ templates: [{ id: templateId, trial: { inputs: [{ photo: 'in.jpg', fields: { dish: 'salmon' }, aspectRatio: '4:5' }], n: options.n ?? 2 } }] }).templates
  const templates = new Map((await listAdminTemplates(service)).map(t => [t.id, t]))
  const { cells } = planCells(items, templates, new Map([['in.jpg', photo.hash]]), {})
  const ctx: RunContext = { deps, actorId: admin, photoIds: new Map([[photo.hash, photoId]]), budgetUsd: options.budgetUsd ?? 5, spentUsd: 0 }
  return { r2, p, cells, ctx, photoId, photo }
}

beforeAll(async () => {
  db = await connectAdmin()
  release = await holdTestBudget(db)
  admin = await createUser(db)
  await db.query("update public.profiles set role='admin' where id=$1", [admin])
})

beforeEach(async () => {
  templateId = await seedTemplate(db)
  await budgetLeft(50)
})

afterAll(async () => {
  await db.query('delete from public.admin_test_runs where created_by=$1', [admin])
  await db.query('delete from public.admin_test_photos where created_by=$1', [admin])
  await db.query('delete from auth.users where id=$1', [admin])
  await release()
  await db.end()
})

describe('templates:trial', () => {
  it('retries a provider failure on the next attempt id, then reuses every result on a re-run', async () => {
    const { p, cells, ctx } = await setup({ failFirst: 1 })
    const first = await runAll(cells, ctx, 1)
    expect(first.map(r => r.outcome)).toEqual(['succeeded', 'succeeded'])
    expect(first[0].run?.id).toBe(runIdOf(cells[0], 1))
    expect(p.generate).toHaveBeenCalledTimes(3)
    const failed = await db.query('select status,error_code from public.admin_test_runs where id=$1', [runIdOf(cells[0], 0)])
    expect(failed.rows[0]).toMatchObject({ status: 'failed' })
    const again = await runAll(cells, { ...ctx, spentUsd: 0 }, 2)
    expect(again.every(r => r.outcome === 'succeeded' && r.reused)).toBe(true)
    expect(p.generate).toHaveBeenCalledTimes(3)
  })

  it('runs only the cells that are new, and uploads the same photo once', async () => {
    const two = await setup({ n: 2 })
    await runAll(two.cells, two.ctx, 2)
    const three = await setup({ n: 3 })
    expect(three.photoId).toBe(two.photoId)
    const results = await runAll(three.cells, three.ctx, 2)
    expect(results.map(r => Boolean(r.reused))).toEqual([true, true, false])
    expect(three.p.generate).toHaveBeenCalledTimes(1)
  })

  it('stops starting cells at this run\'s budget and at the daily budget, before calling the model', async () => {
    const small = await setup({ n: 3, budgetUsd: 0.000001 })
    const results = await runAll(small.cells, small.ctx, 1)
    expect(results.map(r => r.outcome)).toEqual(['succeeded', 'skipped', 'skipped'])
    expect(results[1].code).toBe('RUN_BUDGET_REACHED')
    templateId = await seedTemplate(db)
    await budgetLeft(0)
    const daily = await setup({ n: 2 })
    const stopped = await runAll(daily.cells, daily.ctx, 1)
    expect(stopped.map(r => [r.outcome, r.code])).toEqual([['skipped', 'TEST_BUDGET_EXCEEDED'], ['skipped', 'TEST_BUDGET_EXCEEDED']])
    expect(daily.p.generate).not.toHaveBeenCalled()
  })

  it('is refused for an account that is not an admin', async () => {
    const { cells, ctx } = await setup({ n: 1 })
    const user = await createUser(db)
    const [result] = await runAll(cells, { ...ctx, actorId: user }, 1)
    expect(result).toMatchObject({ outcome: 'failed', code: 'FORBIDDEN' })
    await db.query('delete from auth.users where id=$1', [user])
  })
})
