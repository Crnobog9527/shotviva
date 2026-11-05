import type { Client } from 'pg'
import sharp from 'sharp'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { resolveJobFile, runGeneration } from '@/core/jobs'
import { newInputKey } from '@/core/storage'

import { jpeg } from '../fakes/images'
import { createMemoryStore } from '../fakes/memory-store'
import { fakeProvider, seedTemplate } from './generation-fixtures'
import { connectAdmin, createUser, DAY_MS } from './helpers'
import { serviceSupabase } from './supabase-env'

// Download route rules (T4 card): free public work is watermarked, paid status removes the
// mark (same stored file), private work is clean, non-owners get 404.

let db: Client
let templateId: string

beforeAll(async () => {
  db = await connectAdmin()
  templateId = await seedTemplate(db)
})

afterAll(async () => {
  await db.end()
})

async function finishedJob(paidUntil: Date | null = null) {
  const userId = await createUser(db, { credits: 2, paidUntil })
  const r2 = createMemoryStore()
  const inputKey = newInputKey(userId, 'image/jpeg')
  r2.upload(inputKey, await jpeg(1024, 1024), 'image/jpeg')
  const deps = { db: serviceSupabase(), store: r2.store }
  const view = await runGeneration({ ...deps, provider: fakeProvider().provider }, { userId, source: 'web', templateId, inputKey })
  return { userId, jobId: view.id, deps, r2 }
}

describe('resolveJobFile', () => {
  it('watermarks a free user’s public work as JPEG and keeps the stored PNG clean', async () => {
    const { userId, jobId, deps, r2 } = await finishedJob()
    const file = await resolveJobFile(deps, { userId, jobId, download: true })
    expect(file).toMatchObject({ kind: 'bytes', contentType: 'image/jpeg', filename: `shotviva-${jobId}.jpg` })
    if (file.kind !== 'bytes') throw new Error('expected bytes')
    expect((await sharp(file.body).metadata()).format).toBe('jpeg')
    expect(r2.objects.get(`outputs/${userId}/${jobId}.png`)?.contentType).toBe('image/png')
  })

  it('serves the clean file once the owner is paid, without reprocessing', async () => {
    const { userId, jobId, deps, r2 } = await finishedJob()
    const stored = r2.objects.get(`outputs/${userId}/${jobId}.png`)?.body
    await db.query('update public.profiles set paid_until = $2 where id = $1', [userId, new Date(Date.now() + DAY_MS)])
    const file = await resolveJobFile(deps, { userId, jobId, download: false })
    expect(file).toEqual({ kind: 'redirect', url: `memory://get/outputs/${userId}/${jobId}.png?expires=300` })
    expect(r2.objects.get(`outputs/${userId}/${jobId}.png`)?.body).toBe(stored)
  })

  it('brings the watermark back on public work after paid status lapses', async () => {
    const { userId, jobId, deps } = await finishedJob()
    await db.query('update public.profiles set paid_until = $2 where id = $1', [userId, new Date(Date.now() - DAY_MS)])
    expect((await resolveJobFile(deps, { userId, jobId, download: false })).kind).toBe('bytes')
  })

  it('keeps private work clean even after paid status lapses', async () => {
    const { userId, jobId, deps } = await finishedJob(new Date(Date.now() + DAY_MS))
    await db.query('update public.profiles set paid_until = $2 where id = $1', [userId, new Date(Date.now() - DAY_MS)])
    expect((await resolveJobFile(deps, { userId, jobId, download: false })).kind).toBe('redirect')
  })

  it('answers 404 to anyone but the owner, and for unknown ids', async () => {
    const { jobId, deps } = await finishedJob()
    const stranger = await createUser(db, { credits: 0 })
    await expect(resolveJobFile(deps, { userId: stranger, jobId, download: false })).rejects.toMatchObject({ status: 404 })
    await expect(resolveJobFile(deps, { userId: stranger, jobId: 'nope', download: false })).rejects.toMatchObject({ status: 404 })
  })
})
