import { randomUUID } from 'node:crypto'

import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { refundJob, reserveJob, setJobVisibility, type ReserveJobInput } from '@/core/jobs'

import { anonClient, connectAdmin, createUser, DAY_MS, ledgerOf, profileOf, serviceClient } from './helpers'

// T14 (ARCHITECTURE §6.1, AGENTS §7 item 1): paid pool first, then free, one pool per job,
// never split; the job records the pool; refunds go back to it. paid_until plays no part.

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
  creditsCost: 2,
  source: 'web',
  provider: 'openai',
  ...overrides,
})

const balances = async (userId: string) => {
  const { credits, free_credits } = await profileOf(db, userId)
  return { paid: credits, free: free_credits }
}

describe('reserve_credits pool choice', () => {
  it('free 3 / paid 0, cost 2 → free pool, forced public', async () => {
    const userId = await createUser(db, { freeCredits: 3, credits: 0 })
    const reserved = await reserveJob(service, job(userId, { visibility: 'private' }))
    expect(reserved).toMatchObject({ creditPool: 'free', visibility: 'public' })
    expect(await balances(userId)).toEqual({ paid: 0, free: 1 })
    expect((await ledgerOf(db, userId)).map(({ kind, pool, delta }) => [kind, pool, delta])).toEqual([['reserve', 'free', -2]])
  })

  it('free 3 / paid 30, cost 2 → paid pool, private by default', async () => {
    const userId = await createUser(db, { freeCredits: 3, credits: 30 })
    expect(await reserveJob(service, job(userId))).toMatchObject({ creditPool: 'paid', visibility: 'private' })
    expect(await balances(userId)).toEqual({ paid: 28, free: 3 })
    expect((await ledgerOf(db, userId)).map(({ pool }) => pool)).toEqual(['paid'])
  })

  it('a paid work may start public when asked', async () => {
    const userId = await createUser(db, { credits: 2 })
    expect(await reserveJob(service, job(userId, { visibility: 'public' }))).toMatchObject({
      creditPool: 'paid',
      visibility: 'public',
    })
  })

  it('free 1 / paid 1, cost 2 → fails, nothing charged, no job', async () => {
    const userId = await createUser(db, { freeCredits: 1, credits: 1 })
    const input = job(userId)
    await expect(reserveJob(service, input)).rejects.toMatchObject({ code: 'CREDITS_INSUFFICIENT' })
    expect(await balances(userId)).toEqual({ paid: 1, free: 1 })
    expect(await ledgerOf(db, userId)).toEqual([])
    const { rows } = await db.query('select 1 from public.generation_jobs where id = $1', [input.jobId])
    expect(rows).toHaveLength(0)
  })

  it('never splits: paid 1 / free 3, cost 2 → whole job from the free pool', async () => {
    const userId = await createUser(db, { credits: 1, freeCredits: 3 })
    expect((await reserveJob(service, job(userId))).creditPool).toBe('free')
    expect(await balances(userId)).toEqual({ paid: 1, free: 1 })
  })

  it('falls back to free works once the paid pool runs out', async () => {
    const userId = await createUser(db, { credits: 2, freeCredits: 2 })
    expect((await reserveJob(service, job(userId))).creditPool).toBe('paid')
    expect((await reserveJob(service, job(userId))).creditPool).toBe('free')
    await expect(reserveJob(service, job(userId))).rejects.toMatchObject({ code: 'CREDITS_INSUFFICIENT' })
  })

  it('ignores paid_until: a member with only free credits makes free works, a pack buyer paid ones', async () => {
    const member = await createUser(db, { freeCredits: 2, paidUntil: new Date(Date.now() + 30 * DAY_MS) })
    const packOnly = await createUser(db, { credits: 2, paidUntil: null })
    expect(await reserveJob(service, job(member))).toMatchObject({ creditPool: 'free', visibility: 'public' })
    expect(await reserveJob(service, job(packOnly))).toMatchObject({ creditPool: 'paid', visibility: 'private' })
  })

  it('keeps both pools non-negative under 10 concurrent reserves', async () => {
    const userId = await createUser(db, { credits: 3, freeCredits: 2 })
    const results = await Promise.allSettled(
      Array.from({ length: 10 }, () => reserveJob(service, job(userId, { creditsCost: 1 }))),
    )
    const pools = results.flatMap((r) => (r.status === 'fulfilled' ? [r.value.creditPool] : []))
    expect(pools.filter((p) => p === 'paid')).toHaveLength(3)
    expect(pools.filter((p) => p === 'free')).toHaveLength(2)
    for (const r of results) if (r.status === 'rejected') expect(r.reason).toMatchObject({ code: 'CREDITS_INSUFFICIENT' })
    expect(await balances(userId)).toEqual({ paid: 0, free: 0 })
    expect(await ledgerOf(db, userId)).toHaveLength(5)
  })
})

describe('refund_job returns credits to the original pool', () => {
  it.each(['free', 'paid'] as const)('%s job refunded to the %s pool', async (pool) => {
    const userId = await createUser(db, pool === 'paid' ? { credits: 2, freeCredits: 5 } : { freeCredits: 2 })
    const before = await balances(userId)
    const { id, creditPool } = await reserveJob(service, job(userId))
    expect(creditPool).toBe(pool)
    // Paid credits that arrive meanwhile must not change where the refund goes.
    await db.query('update public.profiles set credits = credits + 10 where id = $1', [userId])
    await refundJob(service, { jobId: id, errorCode: 'PROVIDER_FAILED' })
    expect(await balances(userId)).toEqual({ paid: before.paid + 10, free: before.free })
    expect((await ledgerOf(db, userId)).map(({ kind, pool: p }) => [kind, p])).toEqual([
      ['reserve', pool],
      ['refund', pool],
    ])
  })
})

describe('set_job_visibility', () => {
  it('lets a paid work switch between public and private', async () => {
    const userId = await createUser(db, { credits: 2 })
    const { id } = await reserveJob(service, job(userId))
    expect((await setJobVisibility(service, { jobId: id, userId, visibility: 'public' })).visibility).toBe('public')
    expect((await setJobVisibility(service, { jobId: id, userId, visibility: 'private' })).visibility).toBe('private')
  })

  it('refuses to make a free work private, even after the owner pays', async () => {
    const userId = await createUser(db, { freeCredits: 2 })
    const { id } = await reserveJob(service, job(userId))
    await db.query('update public.profiles set credits = 30, paid_until = $2 where id = $1', [
      userId,
      new Date(Date.now() + 30 * DAY_MS),
    ])
    await expect(setJobVisibility(service, { jobId: id, userId, visibility: 'private' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
    expect((await setJobVisibility(service, { jobId: id, userId, visibility: 'public' })).visibility).toBe('public')
  })

  it('backs the rule with a table check', async () => {
    const userId = await createUser(db, { freeCredits: 2 })
    const { id } = await reserveJob(service, job(userId))
    await expect(
      db.query("update public.generation_jobs set visibility = 'private' where id = $1", [id]),
    ).rejects.toThrow(/generation_jobs_free_work_public/)
  })

  it('answers NOT_FOUND for someone else’s job', async () => {
    const owner = await createUser(db, { credits: 2 })
    const stranger = await createUser(db)
    const { id } = await reserveJob(service, job(owner))
    await expect(setJobVisibility(service, { jobId: id, userId: stranger, visibility: 'public' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
  })

  it('is not callable by client roles', async () => {
    const { error } = await anonClient().rpc('set_job_visibility', {
      p_job_id: randomUUID(),
      p_user_id: randomUUID(),
      p_visibility: 'public',
    })
    expect(error).not.toBeNull()
  })
})
