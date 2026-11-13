import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'

import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { reserveJob, setJobVisibility, type ReserveJobInput } from '@/core/jobs'

import { connectAdmin, createUser, profileOf, publishFixture, serviceClient } from './helpers'
import { serviceSupabase } from './supabase-env'

// Owner 2026-11-12 (ARCHITECTURE §5, §9 第 7 条, migration 1320): a work whose template's ROOT
// category is gallery_excluded (the posters root) is private and out of the gallery, for the
// free pool as well as the paid one. Decided when the job is inserted and stored on it.

const service = serviceClient()
const supabase = serviceSupabase()
let db: Client
const tag = randomUUID().slice(0, 8)
const root = `qa-ex-${tag}`
const leaf = `qa-ex-leaf-${tag}`
const rootTemplate = `qa-ex-root-${tag}`
const leafTemplate = `qa-ex-sub-${tag}`
const plainTemplate = `qa-ex-plain-${tag}`

async function template(id: string, category: string, subcategory: string | null) {
  await db.query(
    `insert into public.templates (id, name, category_key, subcategory_key, fields, quality, credits_cost, is_active, visible_in)
     values ($1, $1, $2, $3, $4, 'medium', '{"1k": 1, "2k": 2, "3k": 3}', false, array['web'])`,
    [id, category, subcategory, JSON.stringify({ images: { min: 0, max: 1 }, copy: [], aspectRatios: ['1:1'] })],
  )
  await publishFixture(db, id)
}

const reserve = (userId: string, templateId: string, overrides: Partial<ReserveJobInput> = {}) =>
  reserveJob(service, { jobId: randomUUID(), userId, module: 'image', templateId, source: 'web', inputs: { resolution: '1k' }, provider: 'openai', ...overrides })

const flags = async (id: string) =>
  (await db.query('select visibility, gallery_excluded as excluded, credit_pool as pool from public.generation_jobs where id = $1', [id])).rows[0]

const succeed = (id: string) =>
  db.query(`update public.generation_jobs set status = 'succeeded', output_key = 'outputs/x/' || id || '.png', finished_at = now() where id = $1`, [id])

beforeAll(async () => {
  db = await connectAdmin()
  await db.query("insert into public.template_categories (key, name_en, name_zh, gallery_excluded) values ($1, $1, $2, true)", [root, `排除${tag}`])
  await db.query('insert into public.template_categories (key, parent_id, name_en, name_zh) values ($1, $2, $1, $3)', [leaf, root, `子类${tag}`])
  await template(rootTemplate, root, null)
  await template(leafTemplate, root, leaf)
  await template(plainTemplate, 'pets', null)
})

afterAll(async () => {
  await db.end()
})

describe('reserving a work from a gallery-excluded root', () => {
  it('keeps a free work private, still charged and watermarked from the free pool', async () => {
    const userId = await createUser(db, { freeCredits: 3 })
    const job = await reserve(userId, rootTemplate)
    expect(job).toMatchObject({ creditPool: 'free', visibility: 'private' })
    expect(await flags(job.id)).toEqual({ visibility: 'private', excluded: true, pool: 'free' })
    expect((await profileOf(db, userId)).free_credits).toBe(2)
  })

  it('covers sub-categories, and a paid work asked to be public stays private', async () => {
    const userId = await createUser(db, { credits: 3 })
    const job = await reserve(userId, leafTemplate, { visibility: 'public' })
    expect(await flags(job.id)).toEqual({ visibility: 'private', excluded: true, pool: 'paid' })
  })

  it('leaves other categories as before: a free work is public', async () => {
    const userId = await createUser(db, { freeCredits: 3 })
    const job = await reserve(userId, plainTemplate)
    expect(await flags(job.id)).toEqual({ visibility: 'public', excluded: false, pool: 'free' })
  })

  it('stores the decision: moving the template or unmarking the root later changes no existing work', async () => {
    const userId = await createUser(db, { freeCredits: 5 })
    const before = await reserve(userId, rootTemplate)
    const moved = `qa-ex-moved-${tag}`
    await template(moved, root, null)
    const kept = await reserve(userId, moved)
    await db.query("update public.templates set category_key = 'pets', subcategory_key = null where id = $1", [moved])
    const after = await reserve(userId, moved)
    expect(await flags(kept.id)).toMatchObject({ visibility: 'private', excluded: true })
    expect(await flags(after.id)).toMatchObject({ visibility: 'public', excluded: false })

    await db.query('update public.template_categories set gallery_excluded = false where key = $1', [root])
    try {
      expect(await flags(before.id)).toMatchObject({ visibility: 'private', excluded: true })
      expect(await flags((await reserve(userId, rootTemplate)).id)).toMatchObject({ visibility: 'public', excluded: false })
    } finally {
      await db.query('update public.template_categories set gallery_excluded = true where key = $1', [root])
    }
  })

  it('makes an edit of an excluded work excluded too', async () => {
    const userId = await createUser(db, { freeCredits: 3 })
    const parent = await reserve(userId, rootTemplate)
    await succeed(parent.id)
    const edit = randomUUID()
    await db.query(
      `insert into public.generation_jobs (id, user_id, module, template_id, parent_job_id, source, visibility, credits_cost, credit_pool, inputs)
       values ($1, $2, 'image', 'edit', $3, 'web', 'public', 1, 'free', '{}')`,
      [edit, userId, parent.id],
    )
    expect(await flags(edit)).toMatchObject({ visibility: 'private', excluded: true })
  })
})

describe('an excluded work stays private', () => {
  it('cannot be made public by the toggle (FORBIDDEN), or by a direct update', async () => {
    const userId = await createUser(db, { credits: 3 })
    const job = await reserve(userId, rootTemplate)
    await expect(setJobVisibility(service, { jobId: job.id, userId, visibility: 'public' })).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect((await setJobVisibility(service, { jobId: job.id, userId, visibility: 'private' })).visibility).toBe('private')
    await db.query("update public.generation_jobs set visibility = 'public' where id = $1", [job.id])
    expect(await flags(job.id)).toMatchObject({ visibility: 'private' })
  })

  it('keeps an excluded free work private without FREE_WORK_PUBLIC', async () => {
    const userId = await createUser(db, { freeCredits: 3 })
    const job = await reserve(userId, rootTemplate)
    expect((await setJobVisibility(service, { jobId: job.id, userId, visibility: 'private' })).visibility).toBe('private')
  })

  it('never clears the flag', async () => {
    const userId = await createUser(db, { freeCredits: 3 })
    const job = await reserve(userId, rootTemplate)
    await expect(db.query('update public.generation_jobs set gallery_excluded = false where id = $1', [job.id])).rejects.toThrow(/GALLERY_EXCLUDED_IMMUTABLE/)
  })

  it('still lets nothing else make a non-excluded free work private', async () => {
    const userId = await createUser(db, { freeCredits: 3 })
    const job = await reserve(userId, plainTemplate)
    await expect(db.query("update public.generation_jobs set visibility = 'private' where id = $1", [job.id])).rejects.toThrow(/generation_jobs_free_work_public/)
  })

  it('never enters moderation: the screen writes nothing for it', async () => {
    const userId = await createUser(db, { freeCredits: 3 })
    const job = await reserve(userId, rootTemplate)
    await succeed(job.id)
    const { data, error } = await supabase.rpc('record_work_auto_moderation', { p_job_id: job.id, p_flagged: false, p_categories: [] })
    expect(error).toBeNull()
    expect(data).toBeNull()
    const queued = await db.query(
      `select 1 from public.generation_jobs where id = $1 and status = 'succeeded' and visibility = 'public' and moderation_status = 'pending'`,
      [job.id],
    )
    expect(queued.rows).toHaveLength(0)
  })
})

describe('the posters root', () => {
  it('starts marked when it is created after the migration', async () => {
    await db.query('begin')
    try {
      await db.query("delete from public.template_categories where key = 'posters' and not exists (select 1 from public.templates where category_key = 'posters')")
      await db.query("insert into public.template_categories (key, name_en, name_zh) values ('posters', 'Posters', '海报') on conflict (key) do nothing")
      const { rows } = await db.query("select gallery_excluded from public.template_categories where key = 'posters'")
      expect(rows[0].gallery_excluded).toBe(true)
    } finally {
      await db.query('rollback')
    }
  })
})

describe('the backfill in migration 1320', () => {
  it('makes works made before it (and edits of them) excluded and private, and leaves others public', async () => {
    const sql = readFileSync('supabase/migrations/1320_gallery_excluded_categories.sql', 'utf8')
    const backfill = /with recursive excluded as[\s\S]*?not gallery_excluded;/.exec(sql)?.[0]
    expect(backfill).toBeDefined()
    const userId = await createUser(db)
    const [old, oldEdit, other] = [randomUUID(), randomUUID(), randomUUID()]
    await db.query('begin')
    try {
      await db.query('alter table public.generation_jobs disable trigger generation_jobs_gallery_excluded')
      const insert = (id: string, templateId: string, parent: string | null) =>
        db.query(
          `insert into public.generation_jobs (id, user_id, module, template_id, parent_job_id, source, status, visibility, credits_cost,
             credit_pool, moderation_status, moderated_at, inputs, output_key, finished_at)
           values ($1, $2, 'image', $3, $4, 'web', 'succeeded', 'public', 1, 'free', 'approved', now(), '{}', $5, now())`,
          [id, userId, templateId, parent, `outputs/x/${id}.png`],
        )
      await insert(old, rootTemplate, null)
      await insert(oldEdit, 'edit', old)
      await insert(other, plainTemplate, null)
      await db.query('alter table public.generation_jobs enable trigger generation_jobs_gallery_excluded')
      await db.query(backfill!)
      expect(await flags(old)).toMatchObject({ visibility: 'private', excluded: true })
      expect(await flags(oldEdit)).toMatchObject({ visibility: 'private', excluded: true })
      expect(await flags(other)).toMatchObject({ visibility: 'public', excluded: false })
    } finally {
      await db.query('rollback')
    }
  })
})
