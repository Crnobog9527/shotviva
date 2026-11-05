import type { Client } from 'pg'
import sharp from 'sharp'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { resolveJobFile, runGeneration, setJobVisibility } from '@/core/jobs'
import { newInputKey } from '@/core/storage'

import { jpeg } from '../fakes/images'
import { createMemoryStore } from '../fakes/memory-store'
import { fakeProvider, seedTemplate } from './generation-fixtures'
import { connectAdmin, createUser, DAY_MS, serviceClient, type TestProfile } from './helpers'
import { serviceSupabase } from './supabase-env'

// Download route rules (T14, ARCHITECTURE §6.2): the watermark follows the work's credit_pool
// only — free works are marked, paid works never are — whatever the owner's paid_until or
// the work's visibility. The stored file is one clean PNG either way; non-owners get 404.

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
const memberUntil = (days: number) => new Date(Date.now() + days * DAY_MS)

async function finishedJob(profile: TestProfile) {
  const userId = await createUser(db, profile)
  const r2 = createMemoryStore()
  const inputKey = newInputKey(userId, 'image/jpeg')
  r2.upload(inputKey, await jpeg(1024, 1024), 'image/jpeg')
  const deps = { db: serviceSupabase(), store: r2.store }
  const view = await runGeneration({ ...deps, provider: fakeProvider().provider }, { userId, source: 'web', templateId, inputKey })
  return { userId, jobId: view.id, view, deps, r2 }
}

const cleanUrl = (userId: string, jobId: string) => `memory://get/outputs/${userId}/${jobId}.png?expires=300`

describe('resolveJobFile', () => {
  it('watermarks a free work as JPEG and keeps the stored PNG clean', async () => {
    const { userId, jobId, view, deps, r2 } = await finishedJob(FREE)
    expect(view).toMatchObject({ credit_pool: 'free', visibility: 'public' })
    const file = await resolveJobFile(deps, { userId, jobId, download: true })
    expect(file).toMatchObject({ kind: 'bytes', contentType: 'image/jpeg', filename: `shotviva-${jobId}.jpg` })
    if (file.kind !== 'bytes') throw new Error('expected bytes')
    expect((await sharp(file.body).metadata()).format).toBe('jpeg')
    expect(r2.objects.get(`outputs/${userId}/${jobId}.png`)?.contentType).toBe('image/png')
  })

  it('keeps a free work watermarked after the owner becomes a paying member', async () => {
    const { userId, jobId, deps } = await finishedJob(FREE)
    await db.query('update public.profiles set credits = 30, paid_until = $2 where id = $1', [userId, memberUntil(30)])
    expect((await resolveJobFile(deps, { userId, jobId, download: false })).kind).toBe('bytes')
  })

  it('serves a paid work clean, private by default', async () => {
    const { userId, jobId, view, deps } = await finishedJob(PAID)
    expect(view).toMatchObject({ credit_pool: 'paid', visibility: 'private' })
    expect(await resolveJobFile(deps, { userId, jobId, download: false })).toEqual({ kind: 'redirect', url: cleanUrl(userId, jobId) })
  })

  it('keeps a paid work clean once made public', async () => {
    const { userId, jobId, deps } = await finishedJob(PAID)
    await setJobVisibility(serviceClient(), { jobId, userId, visibility: 'public' })
    expect((await resolveJobFile(deps, { userId, jobId, download: false })).kind).toBe('redirect')
  })

  it('keeps a paid work clean after the membership lapses or without one at all', async () => {
    const lapsed = await finishedJob({ credits: 2, paidUntil: memberUntil(30) })
    await db.query('update public.profiles set paid_until = $2 where id = $1', [lapsed.userId, memberUntil(-1)])
    expect((await resolveJobFile(lapsed.deps, { userId: lapsed.userId, jobId: lapsed.jobId, download: false })).kind).toBe('redirect')

    const packOnly = await finishedJob({ credits: 2, paidUntil: null })
    expect((await resolveJobFile(packOnly.deps, { userId: packOnly.userId, jobId: packOnly.jobId, download: false })).kind).toBe('redirect')
  })

  it('answers 404 to anyone but the owner, and for unknown ids', async () => {
    const { jobId, deps } = await finishedJob(FREE)
    const stranger = await createUser(db)
    await expect(resolveJobFile(deps, { userId: stranger, jobId, download: false })).rejects.toMatchObject({ status: 404 })
    await expect(resolveJobFile(deps, { userId: stranger, jobId: 'nope', download: false })).rejects.toMatchObject({ status: 404 })
  })
})
