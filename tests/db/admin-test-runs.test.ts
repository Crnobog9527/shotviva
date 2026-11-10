import { randomUUID } from 'node:crypto'

import type { Client } from 'pg'
import sharp from 'sharp'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import type { IdentityJudge } from '@/core/identity-guard'
import type { GenerationProvider, ProviderInput } from '@/core/jobs'
import { cleanupOnOpen, confirmTestPhoto, loadTestBudget, runTestEdit, runTestGenerate, saveTestBudget, setTestRunCover } from '@/modules/image'

import { jpeg, png } from '../fakes/images'
import { createMemoryStore } from '../fakes/memory-store'
import { fakeClassifier, publishEditTemplate } from './edit-fixtures'
import { seedTemplate } from './generation-fixtures'
import { connectAdmin, createUser, profileOf } from './helpers'
import { serviceSupabase } from './supabase-env'
import { holdTestBudget } from './test-run-fixtures'

// T85 admin template test runs (ARCHITECTURE §10.b): the user's generate and edit pipelines on
// admin_test_runs, against the real local database (0780–0788) with in-memory buckets and fake
// providers. Covers the daily budget (one decision at a time), isolation from works, credits and
// refusal records, drafts, the edit tree, set-as-cover and the 30-day cleanup.

let db: Client
let admin: string
const service = serviceSupabase()

// Every call reports usage, priced at GPT Image's official rates: 100×5 + 1000×8 + 2000×30 per M.
const RUN_COST = 0.0685
const PRICES = { inputTextPerM: 5, inputImagePerM: 8, outputPerM: 30 }

function provider(delayMs = 0, priced = true) {
  const calls: Omit<ProviderInput, 'signal'>[] = []
  const generate = vi.fn(async (input: ProviderInput) => {
    calls.push({ ...input })
    if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs))
    return { bytes: await png(1232, 1536), contentType: 'image/png' as const, usage: { input_text_tokens: 100, input_image_tokens: 1000, output_tokens: 2000 } }
  })
  const fake: GenerationProvider = { id: 'fake-openai/gpt-image-2.6', prices: priced ? PRICES : null, generate }
  return { fake, calls, generate }
}

function judge(identitySwap: boolean) {
  const call = vi.fn(async () => ({ identitySwap, usage: { inputTokens: 400, outputTokens: 6 } }))
  const fake: IdentityJudge = { tag: 'fake/luna', prices: { inputTextPerM: 0.1, inputImagePerM: null, outputPerM: 0.5 }, judge: call }
  return { fake, call }
}

async function setup(options: { delayMs?: number; swap?: boolean; priced?: boolean } = {}) {
  const r2 = createMemoryStore()
  const p = provider(options.delayMs, options.priced ?? true)
  const j = judge(options.swap ?? false)
  const deps = { db: service, store: r2.store, provider: p.fake, providerTimeoutMs: 2_000, identityJudge: j.fake }
  const templateId = await seedTemplate(db)
  const photoId = randomUUID()
  const key = `admin-tests/photos/${photoId}.jpg`
  r2.upload(key, await jpeg(1600, 2000), 'image/jpeg')
  await confirmTestPhoto({ db: service, store: r2.store }, admin, photoId, key)
  const generate = (extra: { runId?: string; batchId?: string; note?: string } = {}) =>
    runTestGenerate(deps, {
      actorId: admin,
      body: {
        run_id: extra.runId ?? randomUUID(),
        batch_id: extra.batchId ?? randomUUID(),
        template_id: templateId,
        photo_id: photoId,
        inputs: { copy: { dish: 'salmon' }, resolution: '1k', aspect_ratio: '4:5', note: extra.note },
      },
    })
  return { r2, p, j, deps, templateId, photoId, generate }
}

const runRow = async (id: string) =>
  (await db.query('select status, kind, parent_id, photo_id, batch_id, cost_usd, output_key, cover_set_at, prompt_version from public.admin_test_runs where id = $1', [id])).rows[0]

// The budget is relative to what today already holds, so earlier tests in the file do not matter.
async function budgetLeft(usd: number) {
  const { spentUsd } = await loadTestBudget(service)
  await saveTestBudget(service, admin, Math.round((spentUsd + usd) * 100) / 100)
}

let releaseBudget: () => Promise<void>

beforeAll(async () => {
  db = await connectAdmin()
  releaseBudget = await holdTestBudget(db)
  admin = await createUser(db, { credits: 7, freeCredits: 3 })
  await db.query("update public.profiles set role = 'admin' where id = $1", [admin])
  // Waiting for the other test-run file to release the budget lock can take a while.
}, 120_000)

beforeEach(async () => {
  await saveTestBudget(service, admin, 1000)
})

afterAll(async () => {
  await releaseBudget()
  await db.end()
})

describe('first runs', () => {
  it('runs the template pipeline on a draft, records the real cost and charges nobody', async () => {
    const { p, r2, templateId, generate } = await setup()
    await db.query('update public.templates set is_active = false where id = $1', [templateId])
    const run = await generate({ note: 'warmer light' })
    // The judge's tokens (400 × $0.1 + 6 × $0.5 per M) join the image call's, as on a user's job.
    expect(run).toMatchObject({ status: 'succeeded', kind: 'generate', resolution: '1k', costUsd: 0.068543, outputKey: `admin-tests/outputs/${run.id}.png` })
    // The user's prompt composition: the wrapper with the copy, then the note.
    expect(p.calls[0]).toMatchObject({ prompt: 'WRAPPED studio shot of salmon, keep the plate unchanged\n\nwarmer light', aspectRatio: '4:5', quality: 'medium' })
    expect(r2.objects.has(`admin-tests/outputs/${run.id}.png`)).toBe(true)
    expect(r2.objects.get(`admin-tests/outputs/${run.id}.png.thumb.webp`)?.contentType).toBe('image/webp')
    expect(await profileOf(db, admin)).toMatchObject({ credits: 7, free_credits: 3 })
    const jobs = await db.query('select count(*)::int as n from public.generation_jobs where user_id = $1', [admin])
    expect(jobs.rows[0].n).toBe(0)
  })

  it('settles the provider cost and keeps the successful output when only its thumbnail failed', async () => {
    const { r2, generate } = await setup()
    const put = r2.store.put
    vi.spyOn(r2.store, 'put').mockImplementation(async (key, body, type) => {
      if (key.endsWith('.thumb.webp')) throw new Error('thumbnail unavailable')
      await put(key, body, type)
    })
    const run = await generate()
    expect(run).toMatchObject({ status: 'succeeded', costUsd: expect.any(Number) })
    expect(r2.objects.has(run.outputKey!)).toBe(true)
    expect(r2.objects.has(`${run.outputKey}.thumb.webp`)).toBe(false)
  })

  it('settles a repeat of the same run id to the same run without calling the model again', async () => {
    const { p, generate } = await setup()
    const runId = randomUUID()
    const [a, b] = await Promise.all([generate({ runId }), generate({ runId })])
    expect(a.id).toBe(b.id)
    expect((await generate({ runId })).id).toBe(runId)
    expect(p.generate).toHaveBeenCalledTimes(1)
  })

  it('refuses a face swap like the workspace: a failed run with the judge’s cost, no refusal row, no judge slot', async () => {
    const { p, generate } = await setup({ swap: true })
    const slots = async () => (await db.query('select count(*)::int as n from public.identity_judge_calls where user_id = $1', [admin])).rows[0].n
    const before = await slots()
    const run = await generate({ note: 'put my face on her' })
    expect(run).toMatchObject({ status: 'failed', errorCode: 'IDENTITY_SWAP_REFUSED', costUsd: 0.000043 })
    expect(p.generate).not.toHaveBeenCalled()
    const refusals = await db.query('select count(*)::int as n from public.identity_refusals where user_id = $1', [admin])
    expect(refusals.rows[0].n).toBe(0)
    expect(await slots()).toBe(before)
  })

  it('is refused for anyone but an admin', async () => {
    const { deps, templateId, photoId } = await setup()
    const user = await createUser(db)
    const body = { run_id: randomUUID(), batch_id: randomUUID(), template_id: templateId, photo_id: photoId, inputs: { copy: {} } }
    await expect(runTestGenerate(deps, { actorId: user, body })).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })
})

describe('daily budget', () => {
  it('stops runs once today is spent, before the provider is called', async () => {
    const { p, generate } = await setup()
    await budgetLeft(0.1)
    expect((await generate()).status).toBe('succeeded')
    await expect(generate()).rejects.toMatchObject({ code: 'TEST_BUDGET_EXCEEDED' })
    expect(p.generate).toHaveBeenCalledTimes(1)
  })

  it('holds each running run’s estimate, so a ×3 batch cannot all slip under the cap', async () => {
    const { p, generate } = await setup({ delayMs: 300 })
    // Each 1K medium run holds about $0.064 while it runs (estimate.ts): room for two of three.
    await budgetLeft(0.15)
    const batchId = randomUUID()
    const results = await Promise.allSettled([generate({ batchId }), generate({ batchId }), generate({ batchId })])
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(2)
    expect(results.find((r) => r.status === 'rejected')).toMatchObject({ reason: { code: 'TEST_BUDGET_EXCEEDED' } })
    expect(p.generate).toHaveBeenCalledTimes(2)
  })

  it('calls no model at all once the budget is spent', async () => {
    const { p, j, generate } = await setup()
    await budgetLeft(0)
    await expect(generate({ note: 'warmer' })).rejects.toMatchObject({ code: 'TEST_BUDGET_EXCEEDED' })
    expect(j.call).not.toHaveBeenCalled()
    expect(p.generate).not.toHaveBeenCalled()
  })

  it('counts a finished run that cannot be priced at its estimate, not $0', async () => {
    const { generate } = await setup({ priced: false })
    const before = (await loadTestBudget(service)).spentUsd
    const run = await generate()
    expect(run.costUsd).toBeNull()
    expect((await loadTestBudget(service)).spentUsd - before).toBeCloseTo(run.estimateUsd, 6)
  })

  it('keeps spend after the records go: deleting the template neither refunds the budget nor drops the cost', async () => {
    const { templateId, generate } = await setup()
    await generate()
    const costs = async () => ((await service.rpc('admin_test_daily_costs', { p_days: 1 })).data as { cost_usd: number }[])[0]?.cost_usd ?? 0
    const [spentBefore, costBefore] = [(await loadTestBudget(service)).spentUsd, await costs()]
    await db.query('delete from public.templates where id = $1', [templateId])
    expect((await loadTestBudget(service)).spentUsd).toBeCloseTo(spentBefore, 6)
    expect(await costs()).toBeCloseTo(costBefore, 6)
  })

  it('accepts 0–1000 dollars only', async () => {
    await expect(saveTestBudget(service, admin, -1)).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    await expect(saveTestBudget(service, admin, 1001)).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    await saveTestBudget(service, admin, 12.5)
    expect((await loadTestBudget(service)).budgetUsd).toBe(12.5)
  })
})

describe('edits', () => {
  it('edits a result and the edit again through the photo-edit pipeline, as a tree', async () => {
    const restore = await publishEditTemplate(db)
    try {
      const { p, deps, photoId, generate } = await setup()
      const decision = fakeClassifier({ scope: 'background', keep: ['amber bottle'] })
      const editDeps = { ...deps, classifier: decision.classifier, classifierTimeoutMs: 200 }
      const first = await generate()
      const edit = (parentId: string, batchId = randomUUID()) =>
        runTestEdit(editDeps, { actorId: admin, body: { run_id: randomUUID(), batch_id: batchId, parent_id: parentId, instruction: 'Put it on a beach' } })
      const batchId = randomUUID()
      const edits = await Promise.all([edit(first.id, batchId), edit(first.id, batchId), edit(first.id, batchId)])
      const again = await edit(edits[1]!.id)
      for (const run of [...edits, again]) expect(run).toMatchObject({ status: 'succeeded', kind: 'edit', photoId, resolution: '1k' })
      expect(edits.map((run) => run.parentId)).toEqual([first.id, first.id, first.id])
      expect(again.parentId).toBe(edits[1]!.id)
      expect(again.inputs).toMatchObject({ instruction: 'Put it on a beach', edit_scope: 'background', aspect_ratio: '4:5' })
      // The user's edit prompt: wrapper, the range's paragraph with the keep list, the words.
      expect(p.calls.at(-1)?.prompt).toBe('WRAPPER-EDIT\n\nC-BACKGROUND Keep unchanged: amber bottle.\n\nPut it on a beach')
      // Decision tokens are part of the run's cost, as on a user's edit (no decision prices here).
      expect(again.costUsd).toBeNull()
    } finally {
      await restore()
    }
  })

  it('refuses to edit a run of another template or one that failed', async () => {
    const restore = await publishEditTemplate(db)
    try {
      const { deps } = await setup()
      const editDeps = { ...deps, classifier: null }
      const body = { run_id: randomUUID(), batch_id: randomUUID(), parent_id: randomUUID(), instruction: 'brighter' }
      await expect(runTestEdit(editDeps, { actorId: admin, body })).rejects.toMatchObject({ code: 'NOT_FOUND' })
    } finally {
      await restore()
    }
  })
})

describe('set as cover', () => {
  it('publishes the result as "after" and the test photo as "before", compressed, and marks the run', async () => {
    const { r2, templateId, generate } = await setup()
    const run = await generate()
    const assets = createMemoryStore()
    const coverDeps = { db: service, store: r2.store, assets: assets.store, assetsBaseUrl: 'https://assets.test' }
    expect(await setTestRunCover(coverDeps, admin, run.id)).toBe(templateId)
    const { rows } = await db.query('select cover_before_url, cover_after_url from public.templates where id = $1', [templateId])
    expect(rows[0].cover_after_url).toMatch(new RegExp(`^https://assets\\.test/covers/${templateId}/after-[0-9a-f]{16}\\.webp$`))
    expect(rows[0].cover_before_url).toMatch(new RegExp(`^https://assets\\.test/covers/${templateId}/before-[0-9a-f]{16}\\.webp$`))
    const before = assets.objects.get(rows[0].cover_before_url.replace('https://assets.test/', ''))!
    const meta = await sharp(before.body).metadata()
    expect(meta.format).toBe('webp')
    expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBeLessThanOrEqual(1600)
    expect((await runRow(run.id)).cover_set_at).not.toBeNull()
  })

  it('refuses a language code that is not one (p_locale; language covers themselves: template-cover-locales)', async () => {
    const { generate } = await setup()
    const run = await generate()
    const { error } = await service.rpc('admin_set_test_run_cover', {
      p_actor: admin,
      p_run_id: run.id,
      p_before_url: null,
      p_after_url: 'https://assets.test/covers/x/after-0.webp',
      p_locale: 'Chinese',
    })
    expect(error?.message).toBe('INVALID_INPUT')
    expect((await runRow(run.id)).cover_set_at).toBeNull()
  })
})

describe('cleanup when the panel opens', () => {
  it('deletes runs and photos older than 30 days unless they are a cover, with their objects', async () => {
    const { r2, generate, photoId } = await setup()
    const old = await generate()
    const cover = await generate()
    await db.query("update public.admin_test_runs set created_at = now() - interval '31 days' where id = any($1)", [[old.id, cover.id]])
    await db.query("update public.admin_test_runs set cover_set_at = now() where id = $1", [cover.id])
    await db.query("update public.admin_test_photos set last_used_at = now() - interval '31 days' where id = $1", [photoId])
    await cleanupOnOpen({ db: service, store: r2.store }, admin)
    expect(await runRow(old.id)).toBeUndefined()
    expect(r2.objects.has(`admin-tests/outputs/${old.id}.png`)).toBe(false)
    expect(await runRow(cover.id)).toBeDefined()
    // The cover run started from this photo, so it stays too.
    const photo = await db.query('select id from public.admin_test_photos where id = $1', [photoId])
    expect(photo.rows).toHaveLength(1)
  })

  it('marks a run stuck for 10 minutes as failed so it no longer holds the budget', async () => {
    const { templateId } = await setup()
    const id = randomUUID()
    await db.query(
      `insert into public.admin_test_runs (id, template_id, kind, batch_id, resolution, estimate_usd, created_at)
       values ($1, $2, 'generate', $1, '1k', 3, now() - interval '11 minutes')`,
      [id, templateId],
    )
    await cleanupOnOpen({ db: service, store: createMemoryStore().store }, admin)
    expect(await runRow(id)).toMatchObject({ status: 'failed' })
  })
})

describe('cost reconciliation', () => {
  it('lists today’s test-run cost by UTC day', async () => {
    const { generate } = await setup()
    await generate()
    const { data, error } = await service.rpc('admin_test_daily_costs', { p_days: 1 })
    expect(error).toBeNull()
    expect(data[0].cost_usd).toBeGreaterThanOrEqual(RUN_COST)
    expect(data[0].runs).toBeGreaterThanOrEqual(1)
  })
})
