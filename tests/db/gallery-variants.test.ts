import { randomUUID } from 'node:crypto'

import type { Client } from 'pg'
import sharp from 'sharp'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { decideWorks } from '@/core/admin/gallery-review'
import { galleryVariantKeys } from '@/core/gallery/variants'
import { syncGalleryVariants } from '@/core/gallery/variant-sync'
import { deleteOwnWork } from '@/core/jobs'

import { png } from '../fakes/images'
import { createMemoryStore } from '../fakes/memory-store'
import { connectAdmin, createUser } from './helpers'
import { serviceSupabase } from './supabase-env'

// The gallery's ready-made copies (ARCHITECTURE §9 第 9 条) follow the real moderation functions:
// made when a person approves a work, removed when it is rejected or deleted, never made for a
// work the gallery does not show. The automatic approval's hook is covered in moderate-work.test.ts
// (the gallery_auto_approve switch is shared with gallery-moderation.test.ts, run in parallel).

let db: Client
let admin: string
let owner: string
let template: string
const service = serviceSupabase()

async function work(options: { pool?: 'free' | 'paid'; templateId?: string } = {}) {
  const id = randomUUID()
  const outputKey = `outputs/${owner}/${id}.png`
  await db.query(
    `insert into public.generation_jobs
       (id, user_id, module, template_id, source, status, visibility, credits_cost, output_key, finished_at, credit_pool, inputs)
     values ($1, $2, 'image', $3, 'web', 'succeeded', 'public', 2, $4, now(), $5, '{}'::jsonb)`,
    [id, owner, options.templateId ?? template, outputKey, options.pool ?? 'free'],
  )
  return { id, outputKey }
}

// Runs what the server action would run after its response, at once.
async function decide(r2: ReturnType<typeof createMemoryStore>, jobIds: string[], decision: 'approved' | 'rejected') {
  const tasks: (() => Promise<unknown>)[] = []
  const changed = await decideWorks(
    { db: service, store: r2.store, invalidate: () => undefined, defer: (task) => tasks.push(task) },
    admin,
    { jobIds, decision, reason: decision === 'rejected' ? 'quality' : null },
  )
  await Promise.all(tasks.map((task) => task()))
  return changed
}

const hasVariants = (r2: ReturnType<typeof createMemoryStore>, outputKey: string) => galleryVariantKeys(outputKey).map((key) => r2.objects.has(key))

beforeAll(async () => {
  db = await connectAdmin()
  admin = await createUser(db)
  await db.query("update public.profiles set role = 'admin' where id = $1", [admin])
  owner = await createUser(db)
  template = `t108v-${randomUUID().slice(0, 8)}`
  await db.query(
    `insert into public.templates (id, name, category, fields, is_active, visible_in) values ($1, 'Variants dish', 'food', $2, false, array['web'])`,
    [template, JSON.stringify({ images: { min: 0, max: 1 }, copy: [], aspectRatios: ['1:1'] })],
  )
})

afterAll(async () => {
  await db.end()
})

describe('gallery copies', () => {
  it('are made when a person approves, and removed when the work is rejected', async () => {
    const r2 = createMemoryStore()
    const free = await work()
    const paid = await work({ pool: 'paid' })
    for (const w of [free, paid]) r2.upload(w.outputKey, await png(1200, 1500), 'image/png')
    expect(await decide(r2, [free.id, paid.id], 'approved')).toBe(2)
    for (const w of [free, paid]) expect(hasVariants(r2, w.outputKey)).toEqual([true, true])
    const [small, large] = galleryVariantKeys(free.outputKey).map((key) => r2.objects.get(key)!.body)
    expect(await sharp(small).metadata()).toMatchObject({ format: 'webp', width: 480 })
    expect(await sharp(large).metadata()).toMatchObject({ format: 'webp', width: 960 })

    expect(await decide(r2, [free.id], 'rejected')).toBe(1)
    expect(hasVariants(r2, free.outputKey)).toEqual([false, false])
    expect(hasVariants(r2, paid.outputKey)).toEqual([true, true])
  })

  it('are not made for a work the decision did not approve or the gallery does not show', async () => {
    const r2 = createMemoryStore()
    const gone = await work()
    const freeform = await work({ templateId: 'freeform' })
    const pending = await work()
    for (const w of [gone, freeform, pending]) r2.upload(w.outputKey, await png(600, 600), 'image/png')
    await db.query('update public.generation_jobs set deleted_at = now() where id = $1', [gone.id])
    await decide(r2, [gone.id, freeform.id], 'approved')
    // A stale call for a work that is still pending changes nothing either.
    await syncGalleryVariants({ db: service, store: r2.store }, 'approved', [pending.id])
    for (const w of [gone, freeform, pending]) expect(hasVariants(r2, w.outputKey)).toEqual([false, false])
    // Nor does a stale rejection remove an approved work's copies.
    const approved = await work()
    r2.upload(approved.outputKey, await png(600, 600), 'image/png')
    await decide(r2, [approved.id], 'approved')
    await syncGalleryVariants({ db: service, store: r2.store }, 'rejected', [approved.id])
    expect(hasVariants(r2, approved.outputKey)).toEqual([true, true])
  })

  it('go with the work when its owner deletes it', async () => {
    const r2 = createMemoryStore()
    const w = await work()
    r2.upload(w.outputKey, await png(600, 600), 'image/png')
    await decide(r2, [w.id], 'approved')
    await deleteOwnWork({ db: service, store: r2.store }, { userId: owner, jobId: w.id })
    expect(r2.objects.has(w.outputKey)).toBe(false)
    expect(hasVariants(r2, w.outputKey)).toEqual([false, false])
  })
})
