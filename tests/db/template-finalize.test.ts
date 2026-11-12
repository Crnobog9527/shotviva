import { createHash, randomUUID } from 'node:crypto'

import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { listAdminTemplates } from '@/core/admin/templates/repository'
import type { GenerationProvider } from '@/core/jobs'
import { loadTestBudget, saveTestBudget } from '@/modules/image'
import { buildPlan } from '../../scripts/template-apply/plan'
import { batchResultSchema } from '../../scripts/template-apply/report'
import { parseBatch } from '../../scripts/template-apply/schema'
import { readState } from '../../scripts/template-apply/state'
import { readProgress } from '../../scripts/template-review/progress'
import { finalizeBatch, stageOf } from '../../scripts/template-review/stages'
import { planCells } from '../../scripts/template-trial/cells'
import { ensureTestPhoto } from '../../scripts/template-trial/photos'
import { runAll } from '../../scripts/template-trial/runner'
import { jpeg, png } from '../fakes/images'
import { createMemoryStore } from '../fakes/memory-store'
import { seedTemplate } from './generation-fixtures'
import { connectAdmin, createUser } from './helpers'
import { serviceSupabase } from './supabase-env'
import { holdTestBudget } from './test-run-fixtures'

// The end of the pipeline against a real stack: a trial result (fake provider, in-memory buckets)
// is reviewed, and finalize turns the review into the admin's 「设为封面」, sale and publish through
// admin_apply_template_batch. No real model is called (AGENTS §7).

const service = serviceSupabase()
const privateBucket = createMemoryStore()
const publicBucket = createMemoryStore()
const ASSETS = 'https://assets.test'
let db: Client
let admin: string
let release: () => Promise<void>

const provider: GenerationProvider = { id: 'fake-openai/gpt-image-2.6', prices: { inputTextPerM: 5, inputImagePerM: 8, outputPerM: 30 },
  generate: vi.fn(async () => ({ bytes: await png(640, 800), contentType: 'image/png' as const, usage: { input_text_tokens: 100, input_image_tokens: 1000, output_tokens: 2000 } })) }

beforeAll(async () => {
  db = await connectAdmin()
  release = await holdTestBudget(db)
  admin = await createUser(db)
  await db.query("update public.profiles set role='admin' where id=$1", [admin])
  const { spentUsd } = await loadTestBudget(service)
  await saveTestBudget(service, admin, Math.round((spentUsd + 20) * 100) / 100)
})

afterAll(async () => {
  await db.query('delete from public.admin_test_runs where created_by=$1', [admin])
  await db.query('delete from public.admin_test_photos where created_by=$1', [admin])
  await db.query('delete from public.admin_audit_log where user_id=$1', [admin])
  await db.query('delete from auth.users where id=$1', [admin])
  await release()
  await db.end()
})

// A draft as templates:apply leaves it: unpublished, sale closed, priced well above any floor.
async function draft() {
  const id = await seedTemplate(db)
  await db.query(`update public.templates set is_active=false, description='Shown on the card',
    credits_cost='{"1k":120,"2k":240,"3k":360}' where id=$1`, [id])
  await db.query('delete from public.template_sale_approvals where template_id=$1', [id])
  return id
}

async function trial(id: string) {
  const deps = { db: service, store: privateBucket.store, provider, providerTimeoutMs: 2_000, identityJudge: null }
  const bytes = await jpeg(1200, 1500)
  const photo = { bytes, hash: createHash('sha256').update(bytes).digest('hex') }
  const photoId = await ensureTestPhoto(deps, admin, photo)
  const items = parseBatch({ templates: [{ id, trial: { inputs: [{ photo: 'in.jpg', aspectRatio: '4:5' }] } }] }).templates
  const templates = new Map((await listAdminTemplates(service)).map(t => [t.id, t]))
  const { cells } = planCells(items, templates, new Map([['in.jpg', photo.hash]]), { model: () => ({ providerId: 'fake', model: 'm' }) })
  const [result] = await runAll(cells, { deps, actorId: admin, photoIds: new Map([[photo.hash, photoId]]), budgetUsd: 5, spentUsd: 0,
    reservedUsd: 0, estimateOf: () => 0.1, sleep: async () => {} }, 1)
  return result.run!
}

async function finalize(batch: ReturnType<typeof parseBatch>) {
  const progress = await readProgress(service, batch.templates.map(t => t.id))
  const out = finalizeBatch(batch, progress)
  const ctx = { baseDir: '/', db: service, assetsBase: ASSETS, privateStore: privateBucket.store, publicStore: publicBucket.store }
  const plan = await buildPlan(out.batch, await readState(service, out.batch), { ...ctx, write: true })
  const { data, error } = await service.rpc('admin_apply_template_batch', { p_actor: admin, p_items: plan.map(({ ref, ops }) => ({ ref, ops })), p_validate_only: false })
  if (error) throw new Error(error.message)
  return { out, plan, results: batchResultSchema.parse(data), progress }
}

describe('templates:finalize', () => {
  it('sets the picked trial as the cover, opens the sale and publishes, with the stages along the way', async () => {
    const id = await draft()
    expect(stageOf({ id } as never, (await readProgress(service, [id])).get(id)!)).toContain('待试跑')
    const run = await trial(id)
    const version = run.promptVersion!
    const progress = (await readProgress(service, [id])).get(id)!
    expect(stageOf({ id } as never, progress)).toBe('待评审')
    const batch = parseBatch({ templates: [{ id, review: { status: 'pass', version, pick: run.id } }] })
    const { plan, results } = await finalize(batch)
    expect(plan[0].problems).toEqual([])
    expect(plan[0].ops.map(op => op.op)).toEqual(['test_run_cover', 'set_sale', 'set_active'])
    expect(results).toEqual([{ ref: `template:${id}`, ok: true }])
    const row = (await db.query(`select t.is_active, t.cover_after_url, t.cover_before_url, a.enabled from public.templates t
      join public.template_sale_approvals a on a.template_id=t.id where t.id=$1`, [id])).rows[0]
    expect(row).toMatchObject({ is_active: true, enabled: true })
    expect(row.cover_after_url).toMatch(new RegExp(`^${ASSETS}/covers/${id}/after-[0-9a-f]+\\.webp$`))
    expect(row.cover_before_url).toMatch(new RegExp(`^${ASSETS}/covers/${id}/before-[0-9a-f]+\\.webp$`))
    expect((await db.query('select cover_set_at from public.admin_test_runs where id=$1', [run.id])).rows[0].cover_set_at).not.toBeNull()
    expect(stageOf(batch.templates[0], (await readProgress(service, [id])).get(id)!)).toBe('已上架')
  })

  it('finalizes nothing when one review in the batch names a pick it cannot use', async () => {
    const [good, bad] = [await draft(), await draft()]
    const run = await trial(good)
    const batch = parseBatch({ templates: [{ id: good, review: { status: 'pass', version: run.promptVersion!, pick: run.id } },
      { id: bad, review: { status: 'pass', version: run.promptVersion!, pick: randomUUID() } }] })
    const { problems } = finalizeBatch(batch, await readProgress(service, [good, bad]))
    expect(problems.map(p => p.templateId)).toEqual([bad])
    expect((await db.query('select is_active from public.templates where id=$1', [good])).rows[0].is_active).toBe(false)
  })
})
