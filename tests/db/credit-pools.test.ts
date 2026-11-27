import { randomUUID } from 'node:crypto'

import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { refundJob, reserveJob, setJobVisibility, type ReserveJobInput } from '@/core/jobs'

import { anonClient, connectAdmin, createPricedTemplate, createUser, DAY_MS, ledgerOf, profileOf, serviceClient } from './helpers'

// T14 (ARCHITECTURE §6.1, AGENTS §7 item 1): one pool per job, never split; the job records the
// pool; refunds go back to it. paid_until plays no part. Since 1996 the tier decides the pool: 1K
// from free credits only, 2K / 4K from paid credits only, never the other pool instead.

const service = serviceClient()
let db: Client
// Priced 1 / 2 / 3; jobs default to '2k' (cost 2, paid credits).
const oneK = { inputs: { resolution: '1k' } }
let templateId: string

beforeAll(async () => {
  db = await connectAdmin()
  templateId = await createPricedTemplate(db)
})

afterAll(async () => {
  await db.end()
})

const job = (userId: string, overrides: Partial<ReserveJobInput> = {}): ReserveJobInput => ({
  jobId: randomUUID(),
  userId,
  module: 'image',
  templateId,
  source: 'web',
  inputs: { resolution: '2k' },
  provider: 'openai',
  ...overrides,
})

const balances = async (userId: string) => {
  const { credits, free_credits } = await profileOf(db, userId)
  return { paid: credits, free: free_credits }
}

describe('reserve_credits pool by tier', () => {
  it('1K on free 3 / paid 0, cost 1 → free pool, forced public', async () => {
    const userId = await createUser(db, { freeCredits: 3, credits: 0 })
    const reserved = await reserveJob(service, job(userId, { ...oneK, visibility: 'private' }))
    expect(reserved).toMatchObject({ creditPool: 'free', visibility: 'public' })
    expect(await balances(userId)).toEqual({ paid: 0, free: 2 })
    expect((await ledgerOf(db, userId)).map(({ kind, pool, delta }) => [kind, pool, delta])).toEqual([['reserve', 'free', -1]])
  })

  it('2K on free 3 / paid 30, cost 2 → paid pool, private by default', async () => {
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

  it('free 1 / paid 1, 2K cost 2 → fails, nothing charged, no job', async () => {
    const userId = await createUser(db, { freeCredits: 1, credits: 1 })
    const input = job(userId)
    await expect(reserveJob(service, input)).rejects.toMatchObject({ code: 'CREDITS_INSUFFICIENT' })
    expect(await balances(userId)).toEqual({ paid: 1, free: 1 })
    expect(await ledgerOf(db, userId)).toEqual([])
    const { rows } = await db.query('select 1 from public.generation_jobs where id = $1', [input.jobId])
    expect(rows).toHaveLength(0)
  })

  it('never falls back to the other pool: 2K on free credits alone, 1K on paid credits alone', async () => {
    const freeOnly = await createUser(db, { credits: 1, freeCredits: 30 })
    await expect(reserveJob(service, job(freeOnly))).rejects.toMatchObject({ code: 'CREDITS_INSUFFICIENT' })
    const paidOnly = await createUser(db, { credits: 30 })
    await expect(reserveJob(service, job(paidOnly, oneK))).rejects.toMatchObject({ code: 'CREDITS_INSUFFICIENT' })
    expect(await balances(freeOnly)).toEqual({ paid: 1, free: 30 })
    expect(await balances(paidOnly)).toEqual({ paid: 30, free: 0 })
  })

  it('pays each tier from its own pool until that pool runs out', async () => {
    const userId = await createUser(db, { credits: 2, freeCredits: 1 })
    expect((await reserveJob(service, job(userId, oneK))).creditPool).toBe('free')
    expect((await reserveJob(service, job(userId))).creditPool).toBe('paid')
    await expect(reserveJob(service, job(userId, oneK))).rejects.toMatchObject({ code: 'CREDITS_INSUFFICIENT' })
    await expect(reserveJob(service, job(userId))).rejects.toMatchObject({ code: 'CREDITS_INSUFFICIENT' })
  })

  it('ignores paid_until: a member with only free credits makes free 1K works, a pack buyer paid 2K ones', async () => {
    const member = await createUser(db, { freeCredits: 2, paidUntil: new Date(Date.now() + 30 * DAY_MS) })
    const packOnly = await createUser(db, { credits: 2, paidUntil: null })
    expect(await reserveJob(service, job(member, oneK))).toMatchObject({ creditPool: 'free', visibility: 'public' })
    expect(await reserveJob(service, job(packOnly))).toMatchObject({ creditPool: 'paid', visibility: 'private' })
  })

  it('keeps both pools non-negative under 10 concurrent reserves of both tiers', async () => {
    const userId = await createUser(db, { credits: 4, freeCredits: 2 })
    const results = await Promise.allSettled(
      Array.from({ length: 10 }, (_, i) => reserveJob(service, job(userId, i % 2 ? oneK : {}))),
    )
    const pools = results.flatMap((r) => (r.status === 'fulfilled' ? [r.value.creditPool] : []))
    expect(pools.filter((p) => p === 'paid')).toHaveLength(2)
    expect(pools.filter((p) => p === 'free')).toHaveLength(2)
    for (const r of results) if (r.status === 'rejected') expect(r.reason).toMatchObject({ code: 'CREDITS_INSUFFICIENT' })
    expect(await balances(userId)).toEqual({ paid: 0, free: 0 })
    expect(await ledgerOf(db, userId)).toHaveLength(4)
  })
})

describe('refund_job returns credits to the original pool', () => {
  it.each(['free', 'paid'] as const)('%s job refunded to the %s pool', async (pool) => {
    const userId = await createUser(db, pool === 'paid' ? { credits: 2, freeCredits: 5 } : { freeCredits: 2 })
    const before = await balances(userId)
    const { id, creditPool } = await reserveJob(service, job(userId, pool === 'free' ? oneK : {}))
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
    const { id } = await reserveJob(service, job(userId, oneK))
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
    const { id } = await reserveJob(service, job(userId, oneK))
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
