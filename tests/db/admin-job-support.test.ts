import { randomUUID } from 'node:crypto'

import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { compensateJob, listStuckJobs, refundStuckJobs, viewWork } from '@/core/admin'
import { confirmJob, reserveJob } from '@/core/jobs'

import { createMemoryStore } from '../fakes/memory-store'
import { connectAdmin, createPricedTemplate, createUser, ledgerOf, profileOf } from './helpers'
import { serviceSupabase } from './supabase-env'

// T25 job support tools against the real functions: stuck-job refunds through refund_job, the
// one-time compensation through admin_adjust_credits ('comp:<job>'), and admin_view_work's
// audit row with 5-minute links (ARCHITECTURE §10「卡住任务和单张补偿」「后台查看作品」).

let db: Client
let template: string
const service = serviceSupabase()

async function job(userId: string, inputKey: string | null = null) {
  const jobId = randomUUID()
  await reserveJob(service, {
    jobId,
    userId,
    module: 'image',
    templateId: template,
    source: 'web',
    inputs: { resolution: '2k', input_key: inputKey },
  })
  return jobId
}

const age = (jobId: string, minutes: number) =>
  db.query(`update public.generation_jobs set created_at = now() - make_interval(mins => $2) where id = $1`, [jobId, minutes])

const auditOf = async (userId: string) =>
  (await db.query<{ action: string; target_id: string | null }>('select action, target_id from public.admin_audit_log where user_id = $1 order by id', [userId])).rows

beforeAll(async () => {
  db = await connectAdmin()
  template = await createPricedTemplate(db, { '1k': 1, '2k': 2, '3k': 3 })
})

afterAll(async () => {
  await db.end()
})

describe('stuck jobs', () => {
  it('lists only jobs running for more than 10 minutes and refunds them to their pool', async () => {
    const user = await createUser(db, { credits: 10 })
    const stuck = await job(user)
    const fresh = await job(user)
    await age(stuck, 11)
    const listed = (await listStuckJobs(service)).map((row) => row.id)
    expect(listed).toContain(stuck)
    expect(listed).not.toContain(fresh)
    expect(await refundStuckJobs(service, stuck)).toEqual({ refunded: 1, skipped: 0 })
    expect((await profileOf(db, user)).credits).toBe(8)
    const { rows } = await db.query('select status, error_code from public.generation_jobs where id = $1', [stuck])
    expect(rows[0]).toEqual({ status: 'failed', error_code: 'STUCK_TIMEOUT' })
    // A job under 10 minutes is never refunded, even when asked for by id.
    expect(await refundStuckJobs(service, fresh)).toEqual({ refunded: 0, skipped: 0 })
  })

  it('refund all leaves a settled job alone', async () => {
    const user = await createUser(db, { credits: 10 })
    const done = await job(user)
    await confirmJob(service, { jobId: done, outputKey: `outputs/${user}/${done}.png` })
    const stuck = await job(user)
    await age(done, 30)
    await age(stuck, 30)
    const outcome = await refundStuckJobs(service)
    expect(outcome.refunded).toBeGreaterThanOrEqual(1)
    expect((await profileOf(db, user)).credits).toBe(8)
    expect((await ledgerOf(db, user)).filter((row) => row.kind === 'refund')).toHaveLength(1)
  })
})

describe('compensate one job', () => {
  it('pays the job cost back to its pool exactly once', async () => {
    const user = await createUser(db, { freeCredits: 6 })
    const jobId = await job(user)
    await confirmJob(service, { jobId, outputKey: `outputs/${user}/${jobId}.png` })
    expect((await profileOf(db, user)).free_credits).toBe(4)
    expect(await compensateJob(service, jobId)).toEqual({ applied: true, credits: 2, pool: 'free' })
    expect(await compensateJob(service, jobId)).toEqual({ applied: false, credits: 2, pool: 'free' })
    expect((await profileOf(db, user)).free_credits).toBe(6)
    const rows = (await ledgerOf(db, user)).filter((row) => row.kind === 'admin_adjust')
    expect(rows).toEqual([{ kind: 'admin_adjust', pool: 'free', delta: 2, idempotency_key: `comp:${jobId}` }])
  })

  it('refuses a job that has not succeeded', async () => {
    const user = await createUser(db, { credits: 5 })
    const jobId = await job(user)
    await expect(compensateJob(service, jobId)).rejects.toMatchObject({ code: 'CONFLICT' })
    await expect(compensateJob(service, randomUUID())).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
})

describe('view work', () => {
  it('writes view_work with the job as target and signs 5-minute links', async () => {
    const user = await createUser(db, { credits: 5 })
    const inputKey = `inputs/${user}/${randomUUID()}.jpg`
    const jobId = await job(user, inputKey)
    const outputKey = `outputs/${user}/${jobId}.png`
    await confirmJob(service, { jobId, outputKey })
    const memory = createMemoryStore()
    memory.upload(inputKey, new Uint8Array([1]), 'image/jpeg')
    const links = await viewWork({ db: service, store: memory.store }, jobId)
    expect(links).toEqual({
      output: `memory://get/${outputKey}?expires=300`,
      input: `memory://get/${inputKey}?expires=300`,
      inputExpired: false,
    })
    expect(await auditOf(user)).toEqual([{ action: 'view_work', target_id: jobId }])
  })

  it('shows the input as expired after 7 days, and still logs the view', async () => {
    const user = await createUser(db, { credits: 5 })
    const inputKey = `inputs/${user}/${randomUUID()}.jpg`
    const jobId = await job(user, inputKey)
    await confirmJob(service, { jobId, outputKey: `outputs/${user}/${jobId}.png` })
    const memory = createMemoryStore()
    memory.upload(inputKey, new Uint8Array([1]), 'image/jpeg')
    const later = new Date(Date.now() + 8 * 24 * 60 * 60 * 1000)
    const links = await viewWork({ db: service, store: memory.store, now: later }, jobId)
    expect(links).toMatchObject({ input: null, inputExpired: true })
    // Deleted early by the bucket: the HEAD tells, inside the 7 days too.
    memory.objects.delete(inputKey)
    expect(await viewWork({ db: service, store: memory.store }, jobId)).toMatchObject({ input: null, inputExpired: true })
    expect(await auditOf(user)).toHaveLength(2)
  })

  it('is service-role only and answers NOT_FOUND for a missing job', async () => {
    await expect(viewWork({ db: service, store: createMemoryStore().store }, randomUUID())).rejects.toMatchObject({ code: 'NOT_FOUND' })
    const { anonSupabase } = await import('./supabase-env')
    const { error } = await anonSupabase().rpc('admin_view_work', { p_job_id: randomUUID() })
    expect(error?.message).toMatch(/permission denied/)
  })
})
