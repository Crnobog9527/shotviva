import { randomUUID } from 'node:crypto'

import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { listOwnJobs, listOwnPhotoCategories, reserveJob, type OwnJobsFilter } from '@/core/jobs'

import { seedTemplate } from './generation-fixtures'
import { connectAdmin, serviceClient } from './helpers'
import { account } from './org-fixtures'
import { serviceSupabase } from './supabase-env'

// Photos' category filter (migration 2039): a person's own finished works by root template
// category, an edit counted with the work it was made from, and the watermarked ones.

const service = serviceClient()
const rest = serviceSupabase()
let db: Client
let dish: string
let poster: string
const A = `ph-a-${randomUUID().slice(0, 8)}`
const B = `ph-b-${randomUUID().slice(0, 8)}`

beforeAll(async () => {
  db = await connectAdmin()
  for (const [key, order] of [[A, 9001], [B, 9002]] as const) {
    await db.query('insert into public.template_categories (key, name_en, name_zh, sort_order) values ($1, $2, $3, $4)', [key, `En ${key}`, `中${key.slice(-8)}`, order])
  }
  dish = await seedTemplate(db)
  poster = await seedTemplate(db)
  await db.query('update public.templates set category_key = $2 where id = $1', [dish, A])
  await db.query('update public.templates set category_key = $2 where id = $1', [poster, B])
}, 60_000)

afterAll(async () => {
  await db.end()
})

let tick = 0
// 2K: paid from the person's own paid credits (clean, no watermark).
// A finished work, each a second later than the last. parent: an edit of that work.
async function made(userId: string, templateId: string, parent: string | null = null) {
  const jobId = randomUUID()
  await reserveJob(rest, { jobId, userId, module: 'image', templateId, source: 'web', parentJobId: parent, inputs: { resolution: '2k', attempt_id: randomUUID() } })
  await db.query('select public.confirm_job($1, $2)', [jobId, `outputs/${userId}/${jobId}.png`])
  await db.query(`update public.generation_jobs set created_at = now() - interval '1 hour' + ($2 || ' seconds')::interval where id = $1`, [jobId, String(++tick)])
  return jobId
}

const ids = async (user: string, filter: OwnJobsFilter | null) => (await listOwnJobs(rest, user, new Date(), null, undefined, filter)).done.map((job) => job.id)
const chips = async (user: string) => (await listOwnPhotoCategories(rest, user)).filter((c) => c.key === A || c.key === B).map((c) => [c.key, c.works, c.watermarked])
const person = () => account(db, service, { plan: 'pro_monthly' })

describe('Photos by category', () => {
  it('lists a category\'s works newest first, with the counts the chips show', async () => {
    const user = await person()
    const d1 = await made(user, dish)
    const p1 = await made(user, poster)
    const d2 = await made(user, dish)
    expect(await ids(user, { category: A })).toEqual([d2, d1])
    expect(await ids(user, { category: B })).toEqual([p1])
    expect(await ids(user, null)).toEqual([d2, p1, d1])
    expect(await chips(user)).toEqual([[A, 2, 0], [B, 1, 0]])
    const page = await listOwnJobs(rest, user, new Date(), null, undefined, { category: A })
    expect(page.total).toBe(2)
    expect(page.running).toEqual([])
    // A category the person never used: nothing, not an error.
    expect(await ids(user, { category: 'no-such-category' })).toEqual([])
  })

  it('counts an edit, and an edit of an edit, with the work it started from', async () => {
    const user = await person()
    const original = await made(user, poster)
    const edit = await made(user, 'edit', original)
    const again = await made(user, 'edit', edit)
    expect(await ids(user, { category: B })).toEqual([again, edit, original])
    expect(await ids(user, { category: A })).toEqual([])
    expect(await chips(user)).toEqual([[B, 3, 0]])
    // The original deleted: the row is kept, so its edits stay in the category.
    await db.query('update public.generation_jobs set deleted_at = now() where id = $1', [original])
    expect(await ids(user, { category: B })).toEqual([again, edit])
    // Every row adds up to every finished work, built-in categories included.
    const all = await listOwnPhotoCategories(rest, user)
    expect(all.reduce((sum, c) => sum + c.works, 0)).toBe(2)
  })

  it('narrows to the watermarked works', async () => {
    const user = await person()
    const clean = await made(user, dish)
    const marked = await made(user, dish)
    await db.query(`update public.generation_jobs set credit_pool = 'free', visibility = 'public' where id = $1`, [marked])
    expect(await ids(user, { watermarked: true })).toEqual([marked])
    expect(await ids(user, { category: A })).toEqual([marked, clean])
    expect(await chips(user)).toEqual([[A, 2, 1]])
  })

  it('never reads another person\'s works, deleted ones, or unfinished ones', async () => {
    const user = await person()
    const other = await person()
    const mine = await made(user, dish)
    await made(other, dish)
    const gone = await made(user, dish)
    await db.query('update public.generation_jobs set deleted_at = now() where id = $1', [gone])
    await reserveJob(rest, { jobId: randomUUID(), userId: user, module: 'image', templateId: dish, source: 'web', inputs: { resolution: '2k', attempt_id: randomUUID() } })
    expect(await ids(user, { category: A })).toEqual([mine])
    expect(await chips(user)).toEqual([[A, 1, 0]])
  })

  it('is closed to browsers', async () => {
    for (const fn of ['own_photo_roots(uuid)', 'own_photo_categories(uuid)', 'own_photos_filtered(uuid, text, boolean)']) {
      const { rows } = await db.query(
        `select has_function_privilege('anon', $1, 'execute') as anon, has_function_privilege('authenticated', $1, 'execute') as authed, has_function_privilege('service_role', $1, 'execute') as service`,
        [`public.${fn}`],
      )
      expect(rows[0]).toEqual({ anon: false, authed: false, service: true })
    }
  })
})
