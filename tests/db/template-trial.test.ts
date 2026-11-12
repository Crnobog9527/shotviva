import { createHash } from 'node:crypto'

import type { Client } from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { listAdminTemplates } from '@/core/admin/templates/repository'
import type { IdentityJudge } from '@/core/identity-guard'
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
// budget) with an in-memory bucket and fake providers: reservations under concurrency, retries and
// what is never retried, --retry-failed, resuming, only-what-changed and both budgets. No real model
// is called (AGENTS §7).

const service = serviceSupabase()
const PRICES = { inputTextPerM: 5, inputImagePerM: 8, outputPerM: 30 }
const ESTIMATE = 0.1
let db: Client
let admin: string
let release: () => Promise<void>
let templateId: string
// One bucket for the file, as on the test site: a photo listed once stays readable for later runs.
const bucket = createMemoryStore()

type Step = 'ok' | '5xx' | '402' | 'reject'
const failures: Record<Exclude<Step, 'ok'>, () => ProviderError> = {
  '5xx': () => new ProviderError('failed', 'openai 503 code=- type=-'),
  '402': () => new ProviderError('failed', 'openai 402 code=insufficient_quota type=-'),
  reject: () => new ProviderError('content_rejected', 'openai 400 code=moderation_blocked type=-'),
}

// Answers each call with the next step (the last one repeats); `delayMs` keeps calls overlapping.
function provider(steps: Step[] = ['ok'], delayMs = 0) {
  let calls = 0
  const generate = vi.fn(async () => {
    const step = steps[Math.min(calls++, steps.length - 1)]
    if (delayMs) await new Promise(resolve => setTimeout(resolve, delayMs))
    if (step !== 'ok') throw failures[step]()
    return { bytes: await png(640, 800), contentType: 'image/png' as const, usage: { input_text_tokens: 100, input_image_tokens: 1000, output_tokens: 2000 } }
  })
  const fake: GenerationProvider = { id: 'fake-openai/gpt-image-2.6', prices: PRICES, generate }
  return { fake, generate }
}

const swapJudge: IdentityJudge = { tag: 'fake/luna', prices: { inputTextPerM: 0.1, inputImagePerM: null, outputPerM: 0.5 },
  judge: async () => ({ identitySwap: true, usage: { inputTokens: 400, outputTokens: 6 } }) }

// Today's spend plus what a test may still use (the budget is shared with other test files).
async function budgetLeft(usd: number) {
  const { spentUsd } = await loadTestBudget(service)
  await saveTestBudget(service, admin, Math.round((spentUsd + usd) * 100) / 100)
}

type Options = { steps?: Step[]; delayMs?: number; n?: number; budgetUsd?: number; retryFailed?: boolean; judge?: IdentityJudge; note?: string }

async function setup(options: Options = {}) {
  const p = provider(options.steps, options.delayMs)
  const deps = { db: service, store: bucket.store, provider: p.fake, providerTimeoutMs: 2_000, identityJudge: options.judge ?? null }
  const bytes = await jpeg(1200, 1500)
  const photo = { bytes, hash: createHash('sha256').update(bytes).digest('hex') }
  const photoId = await ensureTestPhoto(deps, admin, photo)
  const input = { photo: 'in.jpg', fields: { dish: 'salmon' }, aspectRatio: '4:5', ...(options.note ? { note: options.note } : {}) }
  const items = parseBatch({ templates: [{ id: templateId, trial: { inputs: [input], n: options.n ?? 2 } }] }).templates
  const templates = new Map((await listAdminTemplates(service)).map(t => [t.id, t]))
  const model = () => ({ providerId: 'fake', model: 'gpt-image-2.6' })
  const { cells } = planCells(items, templates, new Map([['in.jpg', photo.hash]]), { model })
  const ctx: RunContext = { deps, actorId: admin, photoIds: new Map([[photo.hash, photoId]]), budgetUsd: options.budgetUsd ?? 5,
    spentUsd: 0, reservedUsd: 0, estimateOf: () => ESTIMATE, retryFailed: options.retryFailed, sleep: async () => {} }
  return { p, cells, ctx, photoId }
}

const status = async (runId: string) => (await db.query('select status,error_code from public.admin_test_runs where id=$1', [runId])).rows[0]

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
  it('retries a provider hiccup on the next attempt id, then reuses every result on a re-run', async () => {
    const { p, cells, ctx } = await setup({ steps: ['5xx', 'ok'] })
    const sleeps: number[] = []
    const first = await runAll(cells, { ...ctx, sleep: async ms => { sleeps.push(ms) } }, 1)
    expect(first.map(r => r.outcome)).toEqual(['succeeded', 'succeeded'])
    expect(first[0].run?.id).toBe(runIdOf(cells[0], 1))
    expect(sleeps).toEqual([5_000])
    expect(p.generate).toHaveBeenCalledTimes(3)
    expect(await status(runIdOf(cells[0], 0))).toMatchObject({ status: 'failed', error_code: 'PROVIDER_FAILED' })
    const again = await runAll(cells, { ...ctx, spentUsd: 0 }, 2)
    expect(again.every(r => r.outcome === 'succeeded' && r.reused)).toBe(true)
    expect(p.generate).toHaveBeenCalledTimes(3)
  })

  it('never retries a refusal, a face-swap refusal or a request the provider will refuse again', async () => {
    for (const steps of [['reject'], ['402']] as Step[][]) {
      templateId = await seedTemplate(db)
      const { p, cells, ctx } = await setup({ steps, n: 1 })
      const [result] = await runAll(cells, ctx, 1)
      expect(result.outcome).toBe('failed')
      expect(p.generate).toHaveBeenCalledTimes(1)
    }
    templateId = await seedTemplate(db)
    const swap = await setup({ n: 1, judge: swapJudge, note: 'swap the face' })
    const [refused] = await runAll(swap.cells, swap.ctx, 1)
    expect(refused).toMatchObject({ outcome: 'failed', code: 'IDENTITY_SWAP_REFUSED' })
    expect(swap.p.generate).not.toHaveBeenCalled()
    const [still] = await runAll(swap.cells, { ...swap.ctx, retryFailed: true }, 1)
    expect(still).toMatchObject({ outcome: 'failed', code: 'IDENTITY_SWAP_REFUSED', reused: true })
  })

  it('leaves an earlier failure alone unless --retry-failed, which carries on from the next free attempt', async () => {
    const down = await setup({ steps: ['5xx'], n: 1 })
    const [failed] = await runAll(down.cells, down.ctx, 1)
    expect(failed).toMatchObject({ outcome: 'failed', code: 'PROVIDER_FAILED' })
    expect(down.p.generate).toHaveBeenCalledTimes(3)
    const later = await setup({ steps: ['ok'], n: 1 })
    expect((await runAll(later.cells, later.ctx, 1))[0]).toMatchObject({ outcome: 'failed', reused: true })
    expect(later.p.generate).not.toHaveBeenCalled()
    const [fixed] = await runAll(later.cells, { ...later.ctx, retryFailed: true }, 1)
    expect(fixed.outcome).toBe('succeeded')
    expect(fixed.run?.id).toBe(runIdOf(later.cells[0], 3))
  })

  it('reserves each call\'s estimate, so concurrent calls never pass this run\'s budget', async () => {
    const { p, cells, ctx } = await setup({ n: 3, delayMs: 200, budgetUsd: ESTIMATE * 2.5 })
    const results = await runAll(cells, ctx, 3)
    expect(results.map(r => r.outcome).sort()).toEqual(['skipped', 'succeeded', 'succeeded'])
    expect(results.find(r => r.outcome === 'skipped')?.code).toBe('RUN_BUDGET_REACHED')
    expect(p.generate).toHaveBeenCalledTimes(2)
    expect(ctx.reservedUsd).toBe(0)
  })

  it('runs only new cells, uploads a photo once, and stops at the daily budget before calling the model', async () => {
    const two = await setup({ n: 2 })
    await runAll(two.cells, two.ctx, 2)
    const three = await setup({ n: 3 })
    expect(three.photoId).toBe(two.photoId)
    expect((await runAll(three.cells, three.ctx, 2)).map(r => Boolean(r.reused))).toEqual([true, true, false])
    expect(three.p.generate).toHaveBeenCalledTimes(1)
    templateId = await seedTemplate(db)
    await budgetLeft(0)
    const daily = await setup({ n: 2 })
    expect((await runAll(daily.cells, daily.ctx, 1)).map(r => [r.outcome, r.code])).toEqual([['skipped', 'TEST_BUDGET_EXCEEDED'], ['skipped', 'TEST_BUDGET_EXCEEDED']])
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
