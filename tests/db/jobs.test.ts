import { randomUUID } from 'node:crypto'

import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { confirmJob, refundJob, reserveJob, type ReserveJobInput } from '@/core/jobs'

import { connectAdmin, createUser, DAY_MS, ledgerOf, profileOf, serviceClient } from './helpers'

const service = serviceClient()
let db: Client

beforeAll(async () => {
  db = await connectAdmin()
})

afterAll(async () => {
  await db.end()
})

const job = (userId: string, overrides: Partial<ReserveJobInput> = {}): ReserveJobInput => ({
  jobId: randomUUID(),
  userId,
  module: 'image',
  templateId: 'freeform',
  creditsCost: 1,
  source: 'web',
  inputs: { aspect: '1:1' },
  provider: 'openai',
  ...overrides,
})

describe('reserve_credits', () => {
  it('lets only as many of 10 concurrent reserves through as the balance allows', async () => {
    const userId = await createUser(db, { credits: 3 })
    const results = await Promise.allSettled(Array.from({ length: 10 }, () => reserveJob(service, job(userId))))

    const ok = results.filter((r) => r.status === 'fulfilled')
    const failed = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected')
    expect(ok).toHaveLength(3)
    expect(failed).toHaveLength(7)
    for (const failure of failed) expect(failure.reason).toMatchObject({ code: 'CREDITS_INSUFFICIENT' })
    expect((await profileOf(db, userId)).credits).toBe(0)
    expect(await ledgerOf(db, userId)).toHaveLength(3)
  })

  it('charges a replayed job id once', async () => {
    const userId = await createUser(db, { credits: 5 })
    const input = job(userId)
    const results = await Promise.all(Array.from({ length: 5 }, () => reserveJob(service, input)))
    expect(new Set(results.map((r) => r.id))).toEqual(new Set([input.jobId]))
    expect((await profileOf(db, userId)).credits).toBe(4)
  })

  it('returns the first job for a repeated partner idempotency key', async () => {
    const userId = await createUser(db, { credits: 5 })
    const idempotencyKey = `call_${randomUUID()}`
    const first = await reserveJob(service, job(userId, { source: 'graylum', idempotencyKey }))
    const again = await reserveJob(service, job(userId, { source: 'graylum', idempotencyKey }))
    expect(again.id).toBe(first.id)
    expect((await profileOf(db, userId)).credits).toBe(4)
  })

  it('fails without charging when the balance is short', async () => {
    const userId = await createUser(db, { credits: 1 })
    await expect(reserveJob(service, job(userId, { creditsCost: 2 }))).rejects.toMatchObject({
      code: 'CREDITS_INSUFFICIENT',
    })
    expect((await profileOf(db, userId)).credits).toBe(1)
  })

  it('forces free users public and defaults paid users to private', async () => {
    const free = await createUser(db, { credits: 1 })
    const paid = await createUser(db, { credits: 2, paidUntil: new Date(Date.now() + DAY_MS) })

    expect((await reserveJob(service, job(free, { visibility: 'private' }))).visibility).toBe('public')
    expect((await reserveJob(service, job(paid))).visibility).toBe('private')
    expect((await reserveJob(service, job(paid, { visibility: 'public' }))).visibility).toBe('public')
  })

  it('blocks banned users', async () => {
    const userId = await createUser(db, { credits: 3 })
    await db.query("select public.admin_ban_user($1, 'spam')", [userId])
    expect((await profileOf(db, userId)).banned_at).not.toBeNull()
    await expect(reserveJob(service, job(userId))).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect((await profileOf(db, userId)).credits).toBe(3)
  })
})

describe('confirm_job and refund_job', () => {
  it('confirms once and keeps the charge', async () => {
    const userId = await createUser(db, { credits: 2 })
    const { id } = await reserveJob(service, job(userId))
    const confirmed = await Promise.all([
      confirmJob(service, { jobId: id, outputKey: `outputs/${id}.png` }),
      confirmJob(service, { jobId: id, outputKey: `outputs/${id}.png` }),
    ])
    expect(confirmed.map((j) => j.status)).toEqual(['succeeded', 'succeeded'])
    expect(confirmed[0]?.finishedAt).toBeInstanceOf(Date)
    expect((await profileOf(db, userId)).credits).toBe(1)
  })

  it('refunds once even when called repeatedly and concurrently', async () => {
    const userId = await createUser(db, { credits: 2 })
    const { id } = await reserveJob(service, job(userId, { creditsCost: 2 }))
    const refunded = await Promise.all(
      Array.from({ length: 5 }, () => refundJob(service, { jobId: id, errorCode: 'PROVIDER_TIMEOUT' })),
    )
    expect(refunded.every((j) => j.status === 'failed' && j.errorCode === 'PROVIDER_TIMEOUT')).toBe(true)
    expect((await profileOf(db, userId)).credits).toBe(2)
    expect((await ledgerOf(db, userId)).map((row) => row.kind)).toEqual(['reserve', 'refund'])
  })

  it('settles a job only one way', async () => {
    const userId = await createUser(db, { credits: 2 })
    const succeeded = await reserveJob(service, job(userId))
    const failed = await reserveJob(service, job(userId))
    await confirmJob(service, { jobId: succeeded.id, outputKey: 'outputs/a.png' })
    await refundJob(service, { jobId: failed.id, errorCode: 'PROVIDER_ERROR' })

    await expect(refundJob(service, { jobId: succeeded.id, errorCode: 'X' })).rejects.toMatchObject({
      code: 'CONFLICT',
    })
    await expect(confirmJob(service, { jobId: failed.id, outputKey: 'outputs/b.png' })).rejects.toMatchObject({
      code: 'CONFLICT',
    })
    expect((await profileOf(db, userId)).credits).toBe(1)
  })

  it('reports unknown jobs as NOT_FOUND', async () => {
    await expect(confirmJob(service, { jobId: randomUUID(), outputKey: 'k' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
    await expect(refundJob(service, { jobId: randomUUID(), errorCode: 'X' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
  })

  it('cascades jobs and ledger rows when the account is deleted', async () => {
    const userId = await createUser(db, { credits: 1 })
    const { id } = await reserveJob(service, job(userId))
    await db.query('delete from auth.users where id = $1', [userId])
    const { rows } = await db.query('select 1 from public.generation_jobs where id = $1', [id])
    expect(rows).toHaveLength(0)
    expect(await ledgerOf(db, userId)).toHaveLength(0)
  })
})
