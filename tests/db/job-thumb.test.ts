import type { Client } from 'pg'
import sharp from 'sharp'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { deleteOwnWork, firstThumbUrls, resolveJobThumb, runGeneration } from '@/core/jobs'
import { newInputKey, workThumbKeyFor } from '@/core/storage'

import { jpeg } from '../fakes/images'
import { createMemoryStore } from '../fakes/memory-store'
import { fakeProvider, seedTemplate } from './generation-fixtures'
import { connectAdmin, createUser, type TestProfile } from './helpers'
import { serviceSupabase } from './supabase-env'

// ARCHITECTURE §8.3「作品小图」: every finished work gets a small copy for lists, written when the
// job settles and marked exactly when the work is (its credit_pool). The thumbnail route keeps
// the full file's rule: owner only, anyone else 404. The copy goes when the work is deleted.

let db: Client
let templateId: string

beforeAll(async () => {
  db = await connectAdmin()
  templateId = await seedTemplate(db)
})

afterAll(async () => {
  await db.end()
})

const FREE: TestProfile = { freeCredits: 2 }
const PAID: TestProfile = { credits: 2 }

async function finishedJob(profile: TestProfile) {
  const userId = await createUser(db, profile)
  const r2 = createMemoryStore()
  const inputKey = newInputKey(userId, 'image/jpeg')
  r2.upload(inputKey, await jpeg(1024, 1024), 'image/jpeg')
  const deps = { db: serviceSupabase(), store: r2.store }
  const view = await runGeneration({ ...deps, provider: fakeProvider().provider }, { userId, source: 'web', templateId, inputKey })
  const thumbKey = workThumbKeyFor(userId, view.id)
  return { userId, jobId: view.id, view, deps, r2, thumbKey, signed: `memory://get/${thumbKey}?expires=300` }
}

describe('work thumbnails', () => {
  it('writes the small copy when the job settles and the route signs it for the owner', async () => {
    const { userId, jobId, deps, r2, thumbKey, signed } = await finishedJob(PAID)
    // The fake provider answers 1232×1536: the short edge becomes 480.
    expect(await sharp(r2.objects.get(thumbKey)?.body).metadata()).toMatchObject({ format: 'webp', width: 480, height: 598 })
    expect(r2.objects.get(thumbKey)?.contentType).toBe('image/webp')
    expect(await resolveJobThumb(deps, { userId, jobId })).toBe(signed)
    expect(await firstThumbUrls(() => r2.store, [{ id: jobId, userId }])).toEqual(new Map([[jobId, signed]]))
  })

  it('marks a free work’s copy and leaves a paid work’s clean; the stored result stays clean', async () => {
    const free = await finishedJob(FREE)
    const paid = await finishedJob(PAID)
    expect(free.view.credit_pool).toBe('free')
    expect(paid.view.credit_pool).toBe('paid')
    const corner = (bytes?: Uint8Array) => sharp(bytes).extract({ left: 480 - 130, top: 598 - 40, width: 64, height: 24 }).raw().toBuffer()
    // Same provider image for both, so only the mark can differ.
    expect((await corner(free.r2.objects.get(free.thumbKey)?.body)).equals(await corner(paid.r2.objects.get(paid.thumbKey)?.body))).toBe(false)
    const full = (job: typeof free) => Buffer.from(job.r2.objects.get(`outputs/${job.userId}/${job.jobId}.png`)!.body)
    expect(full(free).equals(full(paid))).toBe(true)
  })

  it('makes the copy on first view for a work that has none, marked for a free work', async () => {
    const { userId, jobId, deps, r2, thumbKey, signed } = await finishedJob(FREE)
    const settled = Buffer.from(r2.objects.get(thumbKey)!.body)
    r2.objects.delete(thumbKey)
    expect((await firstThumbUrls(() => r2.store, [{ id: jobId, userId }])).size).toBe(0)
    expect(await resolveJobThumb(deps, { userId, jobId })).toBe(signed)
    expect(Buffer.from(r2.objects.get(thumbKey)!.body).equals(settled)).toBe(true)
  })

  it('answers 404 to anyone but the owner, and for unknown ids, without making anything', async () => {
    const { jobId, deps, r2, thumbKey } = await finishedJob(PAID)
    r2.objects.delete(thumbKey)
    const stranger = await createUser(db)
    await expect(resolveJobThumb(deps, { userId: stranger, jobId })).rejects.toMatchObject({ status: 404 })
    await expect(resolveJobThumb(deps, { userId: stranger, jobId: 'nope' })).rejects.toMatchObject({ status: 404 })
    expect(r2.objects.has(thumbKey)).toBe(false)
  })

  it('deletes the copy with the work, and a deleted work has no thumbnail', async () => {
    const { userId, jobId, deps, r2, thumbKey } = await finishedJob(PAID)
    await deleteOwnWork(deps, { userId, jobId })
    expect(r2.objects.has(thumbKey)).toBe(false)
    await expect(resolveJobThumb(deps, { userId, jobId })).rejects.toMatchObject({ status: 404 })
  })
})
