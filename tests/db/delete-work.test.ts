import { randomUUID } from 'node:crypto'

import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { listJobs, parseJobFilters, viewWork } from '@/core/admin'
import {
  deleteOwnJob,
  deleteOwnWork,
  findJobByIdempotencyKey,
  findOwnJob,
  listOwnJobs,
  reserveJob,
  resolveJobFile,
  resolveJobOriginal,
  runGeneration,
  setJobVisibility,
  type GenerationRequest,
} from '@/core/jobs'
import { inputPreviewKeyFor, newInputKey } from '@/core/storage'
import { listWorkOptions } from '@/core/support'
import { loadAgain, type CatalogueTemplate } from '@/modules/image'

import { jpeg } from '../fakes/images'
import { createMemoryStore } from '../fakes/memory-store'
import { publishEditTemplate } from './edit-fixtures'
import { fakeProvider, seedTemplate } from './generation-fixtures'
import { connectAdmin, createUser, ledgerOf, profileOf } from './helpers'
import { serviceSupabase } from './supabase-env'

// T41 / ARCHITECTURE §6.2「删除作品」: the owner deletes a finished work. The row stays (soft
// delete) for the ledger, costs and admin stats; every user-facing read leaves it out; its R2
// files go; credits stay spent.

let db: Client
let templateId: string
let restoreEdit: () => Promise<void>
const service = serviceSupabase()

beforeAll(async () => {
  db = await connectAdmin()
  templateId = await seedTemplate(db)
  restoreEdit = await publishEditTemplate(db)
})

afterAll(async () => {
  await restoreEdit()
  await db.end()
})

async function work(note = 'keep the chain gold') {
  const userId = await createUser(db, { credits: 5 })
  const r2 = createMemoryStore()
  const inputKey = newInputKey(userId, 'image/jpeg')
  r2.upload(inputKey, await jpeg(800, 1000), 'image/jpeg')
  const deps = { db: service, store: r2.store, provider: fakeProvider().provider, providerTimeoutMs: 200 }
  const request: GenerationRequest = { userId, source: 'web', templateId, inputKey, copy: { dish: 'ramen' }, aspectRatio: '4:5', note, idempotencyKey: `call-${randomUUID()}` }
  const view = await runGeneration(deps, request)
  const job = (await findOwnJob(service, userId, view.id))!
  const files = [job.outputKey!, inputPreviewKeyFor(userId, job.id), `outputs/${userId}/${job.id}-in-1.jpg`]
  return { userId, r2, job, files, request }
}

const rowOf = async (jobId: string) =>
  (await db.query<{ deleted_at: Date | null; inputs: Record<string, unknown>; status: string; cost_usd: string | null }>(
    'select deleted_at, inputs, status, cost_usd from public.generation_jobs where id = $1',
    [jobId],
  )).rows[0]!

// Reads as the user's own session would (RLS generation_jobs_select_own), rolled back.
async function visibleToOwner(userId: string): Promise<string[]> {
  await db.query('begin')
  try {
    await db.query('set local role authenticated')
    await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: userId, role: 'authenticated' })])
    return (await db.query<{ id: string }>('select id from public.generation_jobs')).rows.map((row) => row.id)
  } finally {
    await db.query('rollback')
  }
}

describe('deleting a work', () => {
  it('keeps the row and the ledger, drops what the user typed, and deletes every file', async () => {
    const { userId, r2, job, files } = await work()
    expect(files.every((key) => r2.objects.has(key))).toBe(true)
    const credits = (await profileOf(db, userId)).credits
    const ledger = await ledgerOf(db, userId)
    const cost = (await rowOf(job.id)).cost_usd

    await deleteOwnWork({ db: service, store: r2.store }, { userId, jobId: job.id })

    const row = await rowOf(job.id)
    expect(row.deleted_at).toBeInstanceOf(Date)
    expect(row.status).toBe('succeeded')
    expect(row.cost_usd).toBe(cost)
    expect(row.inputs).not.toHaveProperty('note')
    expect(row.inputs).not.toHaveProperty('copy')
    expect(row.inputs).toMatchObject({ resolution: '1k', aspect_ratio: '4:5' })
    expect((await profileOf(db, userId)).credits).toBe(credits)
    expect(await ledgerOf(db, userId)).toEqual(ledger)
    expect(files.some((key) => r2.objects.has(key))).toBe(false)
  })

  it('leaves it out of every user-facing read', async () => {
    const { userId, r2, job, request } = await work()
    const other = await work()
    await deleteOwnWork({ db: service, store: r2.store }, { userId, jobId: job.id })
    const deps = { db: service, store: r2.store }

    expect(await findOwnJob(service, userId, job.id)).toBeNull()
    expect(await findJobByIdempotencyKey(service, userId, request.idempotencyKey!)).toBeNull()
    expect((await listOwnJobs(service, userId, new Date())).done.map((j) => j.id)).not.toContain(job.id)
    expect((await listWorkOptions(service, userId)).map((w) => w.id)).not.toContain(job.id)
    expect(await visibleToOwner(userId)).toEqual([])
    expect(await visibleToOwner(other.userId)).toEqual([other.job.id])
    await expect(resolveJobFile(deps, { userId, jobId: job.id, download: false })).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(resolveJobOriginal(deps, { userId, jobId: job.id })).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(setJobVisibility(service, { jobId: job.id, userId, visibility: 'public' })).rejects.toMatchObject({ code: 'NOT_FOUND' })
    const template = { id: templateId, creditsCost: { '1k': 1, '2k': 2, '3k': 3 }, copyFields: [] } as unknown as CatalogueTemplate
    expect(await loadAgain({ db: service, store: () => r2.store }, { userId, jobId: job.id, template })).toBeNull()
    // An edit cannot start from it, even straight at the database.
    await expect(
      reserveJob(service, { jobId: randomUUID(), userId, module: 'image', templateId: 'edit', source: 'web', parentJobId: job.id, inputs: { resolution: '1k' } }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('is the owner’s only, finished works only, and fine to repeat', async () => {
    const { userId, r2, job } = await work()
    const stranger = await createUser(db)
    await expect(deleteOwnJob(service, { jobId: job.id, userId: stranger })).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect((await rowOf(job.id)).deleted_at).toBeNull()

    const running = randomUUID()
    await reserveJob(service, { jobId: running, userId, module: 'image', templateId, source: 'web', inputs: { resolution: '1k' } })
    await expect(deleteOwnJob(service, { jobId: running, userId })).rejects.toMatchObject({ code: 'CONFLICT' })

    await deleteOwnWork({ db: service, store: r2.store }, { userId, jobId: job.id })
    const first = (await rowOf(job.id)).deleted_at
    await deleteOwnWork({ db: service, store: r2.store }, { userId, jobId: job.id })
    expect((await rowOf(job.id)).deleted_at).toEqual(first)

    const { anonSupabase } = await import('./supabase-env')
    const { error } = await anonSupabase().rpc('delete_own_job', { p_job_id: job.id, p_user_id: userId })
    expect(error?.message).toMatch(/permission denied/)
  })

  it('deletes a failed work too', async () => {
    const userId = await createUser(db, { credits: 5 })
    const r2 = createMemoryStore()
    const inputKey = newInputKey(userId, 'image/jpeg')
    r2.upload(inputKey, await jpeg(640, 480), 'image/jpeg')
    const deps = { db: service, store: r2.store, provider: fakeProvider('fail').provider, providerTimeoutMs: 200 }
    const failure = (await runGeneration(deps, { userId, source: 'web', templateId, inputKey, aspectRatio: '4:5' }).catch((e: unknown) => e)) as { jobId: string }
    await deleteOwnWork({ db: service, store: r2.store }, { userId, jobId: failure.jobId })
    expect((await rowOf(failure.jobId)).deleted_at).toBeInstanceOf(Date)
  })

  it('stays deleted when the files will not delete', async () => {
    const { userId, r2, job } = await work()
    const broken = { ...r2.store, delete: () => Promise.reject(new Error('r2 down')) }
    await expect(deleteOwnWork({ db: service, store: broken }, { userId, jobId: job.id })).resolves.toBeUndefined()
    expect((await rowOf(job.id)).deleted_at).toBeInstanceOf(Date)
  })
})

describe('admin', () => {
  it('still lists the job, marked deleted by the user, and view-work signs nothing', async () => {
    const { userId, r2, job } = await work()
    await deleteOwnWork({ db: service, store: r2.store }, { userId, jobId: job.id })
    const page = await listJobs(service, parseJobFilters({ template: templateId }))
    expect(page.items.find((item) => item.id === job.id)).toMatchObject({ status: 'succeeded', deletedByUser: true })
    expect(await viewWork({ db: service, store: r2.store }, job.id)).toEqual({ output: null, input: null, inputExpired: false, deleted: true })
    const audit = await db.query("select 1 from public.admin_audit_log where action = 'view_work' and target_id = $1", [job.id])
    expect(audit.rowCount).toBe(1)
  })
})
