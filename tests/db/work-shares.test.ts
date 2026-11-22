import { randomUUID } from 'node:crypto'

import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { deleteOwnJob } from '@/core/jobs'
import { inputPreviewKeyFor } from '@/core/storage'
import { createWorkShare, listWorkShares, readWorkShare, revokeWorkShare, sharedImageUrl, worksWithBefore } from '@/core/work-share'

import { jpeg } from '../fakes/images'
import { createMemoryStore } from '../fakes/memory-store'
import { seedTemplate } from './generation-fixtures'
import { anonClient, connectAdmin, createUser } from './helpers'
import { serviceSupabase } from './supabase-env'

// 作品集分享 (ARCHITECTURE §6.2, migrations 1870–1871): links made only from the caller's own
// finished works, readable by anyone with the link until revoked, never a clean free work,
// before photos only when opted in, deleted works and missing originals left out.

let db: Client
let template: string
const service = serviceSupabase()

beforeAll(async () => {
  db = await connectAdmin()
  template = await seedTemplate(db)
}, 60_000)

afterAll(async () => {
  await db.end()
})

type WorkOptions = { pool?: 'free' | 'paid'; status?: 'succeeded' | 'failed' }

async function work(owner: string, options: WorkOptions = {}) {
  const id = randomUUID()
  const pool = options.pool ?? 'paid'
  const succeeded = (options.status ?? 'succeeded') === 'succeeded'
  await db.query(
    `insert into public.generation_jobs
       (id, user_id, module, template_id, source, status, visibility, credits_cost, output_key, finished_at, credit_pool, inputs, error_code)
     values ($1, $2, 'image', $3, 'web', $4, $5, 2, $6, now(), $7, $8, $9)`,
    [id, owner, template, succeeded ? 'succeeded' : 'failed', pool === 'free' ? 'public' : 'private', succeeded ? `outputs/${owner}/${id}.png` : null, pool,
      JSON.stringify({ aspect_ratio: '4:5', note: 'private note' }), succeeded ? null : 'GENERATION_FAILED'],
  )
  return id
}

// A store holding each work's result and, unless told otherwise, its 768px before preview.
async function storeFor(owner: string, jobs: string[], { withoutBefore = [] as string[] } = {}) {
  const r2 = createMemoryStore()
  for (const job of jobs) {
    r2.upload(`outputs/${owner}/${job}.png`, await jpeg(64, 80), 'image/png')
    if (!withoutBefore.includes(job)) r2.upload(inputPreviewKeyFor(owner, job), await jpeg(40, 50), 'image/webp')
  }
  return r2
}

const keyOf = (url: string) => url.replace(/^memory:\/\/get\//, '').replace(/\?.*$/, '')

// Runs SQL as a signed-in user (RLS and grants as the browser's session would see them), rolled back.
async function asUser<T>(userId: string, run: () => Promise<T>): Promise<T> {
  await db.query('begin')
  try {
    await db.query('set local role authenticated')
    await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: userId, role: 'authenticated' })])
    return await run()
  } finally {
    await db.query('rollback')
  }
}

describe('creating a link', () => {
  it('keeps the order, defaults show_before to off, and reads back without deleted works', async () => {
    const owner = await createUser(db)
    const [a, b, c] = [await work(owner), await work(owner, { pool: 'free' }), await work(owner)]
    const id = await createWorkShare(service, owner, { jobIds: [c, a, b], title: '  Spring menu  ' })
    expect(id).toMatch(/^[0-9a-f]{32}$/)
    const share = await readWorkShare(service, id)
    expect(share?.showBefore).toBe(false)
    expect(share?.title).toBe('Spring menu')
    expect(share?.items.map((item) => item.jobId)).toEqual([c, a, b])
    expect(share?.items.find((item) => item.jobId === b)?.creditPool).toBe('free')

    await deleteOwnJob(service, { userId: owner, jobId: a })
    expect((await readWorkShare(service, id))?.items.map((item) => item.jobId)).toEqual([c, b])
    const [listed] = await listWorkShares(service, owner)
    expect(listed).toMatchObject({ id, works: 2, coverJobId: c, revokedAt: null })
  })

  it("rejects someone else's work, an unfinished or deleted one, repeats and more than 30", async () => {
    const owner = await createUser(db)
    const other = await createUser(db)
    const mine = await work(owner)
    const theirs = await work(other)
    const failed = await work(owner, { status: 'failed' })
    const gone = await work(owner)
    await deleteOwnJob(service, { userId: owner, jobId: gone })
    for (const jobIds of [[mine, theirs], [failed], [gone], [randomUUID()]]) {
      await expect(createWorkShare(service, owner, { jobIds })).rejects.toMatchObject({ code: 'NOT_FOUND' })
    }
    await expect(createWorkShare(service, owner, { jobIds: [mine, mine] })).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    await expect(createWorkShare(service, owner, { jobIds: Array.from({ length: 31 }, () => randomUUID()) })).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    // The database checks on its own too, whatever the caller sends.
    const raw = await service.rpc('create_work_share', { p_user_id: owner, p_job_ids: [mine, mine] })
    expect(raw.error?.message).toBe('INVALID_INPUT')
    expect(Number((await db.query('select count(*) from public.work_shares where user_id = $1', [owner])).rows[0].count)).toBe(0)
  })

  it('caps live links per account and refuses a banned account', async () => {
    const owner = await createUser(db)
    const job = await work(owner)
    // Older than a day, so only the live-link cap applies.
    await db.query(`insert into public.work_shares (user_id, job_ids, created_at) select $1, array[$2::uuid], now() - interval '2 days' from generate_series(1, 200)`, [owner, job])
    await expect(createWorkShare(service, owner, { jobIds: [job] })).rejects.toMatchObject({ code: 'RATE_LIMITED' })
    await db.query('update public.work_shares set revoked_at = now() where id = (select id from public.work_shares where user_id = $1 limit 1)', [owner])
    await expect(createWorkShare(service, owner, { jobIds: [job] })).resolves.toMatch(/^[0-9a-f]{32}$/)

    const banned = await createUser(db)
    const bannedJob = await work(banned)
    const link = await createWorkShare(service, banned, { jobIds: [bannedJob] })
    await db.query('update public.profiles set banned_at = now() where id = $1', [banned])
    await expect(createWorkShare(service, banned, { jobIds: [bannedJob] })).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect(await readWorkShare(service, link)).toBeNull()
  })
})

describe('creation limits', () => {
  const make = (owner: string, count: number, age: string, revoked = false) =>
    db.query(
      `insert into public.work_shares (user_id, job_ids, created_at, revoked_at)
       select $1, array[gen_random_uuid()], now() - $3::interval, case when $4 then now() end from generate_series(1, $2)`,
      [owner, count, age, revoked],
    )

  it('allows 20 links an hour, turned-off ones included', async () => {
    const owner = await createUser(db)
    const job = await work(owner)
    await make(owner, 19, '10 minutes', true)
    await expect(createWorkShare(service, owner, { jobIds: [job] })).resolves.toMatch(/^[0-9a-f]{32}$/)
    await expect(createWorkShare(service, owner, { jobIds: [job] })).rejects.toMatchObject({ code: 'RATE_LIMITED', message: 'Too many share links made recently' })
    expect((await service.rpc('create_work_share', { p_user_id: owner, p_job_ids: [job] })).error?.message).toBe('WORK_SHARE_RATE_LIMITED')
  })

  it('allows 100 links a day, turned-off ones included', async () => {
    const owner = await createUser(db)
    const job = await work(owner)
    await make(owner, 100, '3 hours', true)
    await expect(createWorkShare(service, owner, { jobIds: [job] })).rejects.toMatchObject({ code: 'RATE_LIMITED', message: 'Too many share links made recently' })
    await db.query(`update public.work_shares set created_at = now() - interval '25 hours' where user_id = $1`, [owner])
    await expect(createWorkShare(service, owner, { jobIds: [job] })).resolves.toMatch(/^[0-9a-f]{32}$/)
  })
})

describe('moderation', () => {
  const reject = (job: string) =>
    db.query(`update public.generation_jobs set moderation_status = 'rejected', moderation_reason = 'sexual', moderated_at = now() where id = $1`, [job])

  it('refuses a work moderation rejected', async () => {
    const owner = await createUser(db)
    const [ok, rejected] = [await work(owner, { pool: 'free' }), await work(owner, { pool: 'free' })]
    await reject(rejected)
    await expect(createWorkShare(service, owner, { jobIds: [ok, rejected] })).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(createWorkShare(service, owner, { jobIds: [ok] })).resolves.toMatch(/^[0-9a-f]{32}$/)
  })

  it('drops a work rejected after sharing from the page, the list and the image routes', async () => {
    const owner = await createUser(db)
    const [kept, later] = [await work(owner), await work(owner, { pool: 'free' })]
    const r2 = await storeFor(owner, [kept, later])
    const deps = { db: service, store: r2.store }
    const id = await createWorkShare(service, owner, { jobIds: [later, kept], showBefore: true })
    expect(keyOf(await sharedImageUrl(deps, { shareId: id, jobId: later, side: 'after' }))).not.toBe(`outputs/${owner}/${later}.png`)
    await reject(later)
    expect((await readWorkShare(service, id))?.items.map((item) => item.jobId)).toEqual([kept])
    expect((await listWorkShares(service, owner))[0]).toMatchObject({ id, works: 1, coverJobId: kept })
    for (const side of ['after', 'before'] as const) {
      await expect(sharedImageUrl(deps, { shareId: id, jobId: later, side })).rejects.toMatchObject({ code: 'NOT_FOUND' })
    }
  })
})

describe('revoking', () => {
  it('only the owner can turn a link off, and it then reads as missing', async () => {
    const owner = await createUser(db)
    const other = await createUser(db)
    const id = await createWorkShare(service, owner, { jobIds: [await work(owner)] })
    await expect(revokeWorkShare(service, other, id)).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(await readWorkShare(service, id)).not.toBeNull()
    await revokeWorkShare(service, owner, id)
    await revokeWorkShare(service, owner, id)
    expect(await readWorkShare(service, id)).toBeNull()
    expect((await listWorkShares(service, owner))[0]?.revokedAt).toBeInstanceOf(Date)
    await expect(revokeWorkShare(service, owner, 'f'.repeat(32))).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
})

describe('access from clients', () => {
  it('gives anon and signed-in sessions no function and only their own rows', async () => {
    const owner = await createUser(db)
    const other = await createUser(db)
    const job = await work(owner)
    const id = await createWorkShare(service, owner, { jobIds: [job] })
    const anon = anonClient()
    for (const [fn, args] of [
      ['create_work_share', { p_user_id: owner, p_job_ids: [job] }],
      ['revoke_work_share', { p_user_id: owner, p_share_id: id }],
      ['list_work_shares', { p_user_id: owner }],
      ['read_work_share', { p_share_id: id }],
    ] as const) {
      expect((await anon.rpc(fn, args)).error).not.toBeNull()
    }
    expect((await anon.select('work_shares')).ok).toBe(false)

    expect(await asUser(owner, async () => (await db.query('select id from public.work_shares')).rows.map((row) => row.id))).toEqual([id])
    expect(await asUser(other, async () => (await db.query('select id from public.work_shares')).rows)).toEqual([])
    await expect(asUser(other, () => db.query('select public.read_work_share($1)', [id]))).rejects.toThrow(/permission denied/)
    await expect(asUser(owner, () => db.query('update public.work_shares set show_before = true where id = $1', [id]))).rejects.toThrow(/permission denied/)
    await expect(asUser(owner, () => db.query(`insert into public.work_shares (user_id, job_ids) values ($1, array[$2::uuid])`, [owner, job]))).rejects.toThrow(/permission denied/)
  })
})

describe('the images of a link', () => {
  it('never hands out a clean free work, and shows a before only when the sharer opted in', async () => {
    const owner = await createUser(db)
    const free = await work(owner, { pool: 'free' })
    const paid = await work(owner)
    const r2 = await storeFor(owner, [free, paid])
    const deps = { db: service, store: r2.store }
    const closed = await createWorkShare(service, owner, { jobIds: [free, paid] })

    const freeAfter = keyOf(await sharedImageUrl(deps, { shareId: closed, jobId: free, side: 'after' }))
    expect(freeAfter).not.toBe(`outputs/${owner}/${free}.png`)
    expect(r2.objects.get(freeAfter)?.body).not.toEqual(r2.objects.get(`outputs/${owner}/${free}.png`)?.body)
    expect(keyOf(await sharedImageUrl(deps, { shareId: closed, jobId: paid, side: 'after' }))).toBe(`outputs/${owner}/${paid}.png`)
    await expect(sharedImageUrl(deps, { shareId: closed, jobId: paid, side: 'before' })).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(await worksWithBefore(r2.store, (await readWorkShare(service, closed))!)).toEqual(new Set())

    const open = await createWorkShare(service, owner, { jobIds: [free, paid], showBefore: true })
    expect(keyOf(await sharedImageUrl(deps, { shareId: open, jobId: paid, side: 'before' }))).toBe(inputPreviewKeyFor(owner, paid))
  })

  it("answers 404 for a job outside the link, a deleted work, a missing original and a revoked link", async () => {
    const owner = await createUser(db)
    const other = await createUser(db)
    const [kept, noOriginal, removed] = [await work(owner), await work(owner), await work(owner)]
    const outsider = await work(other)
    const r2 = await storeFor(owner, [kept, noOriginal, removed], { withoutBefore: [noOriginal] })
    const deps = { db: service, store: r2.store }
    const id = await createWorkShare(service, owner, { jobIds: [kept, noOriginal, removed], showBefore: true })
    await deleteOwnJob(service, { userId: owner, jobId: removed })

    expect(await worksWithBefore(r2.store, (await readWorkShare(service, id))!)).toEqual(new Set([kept]))
    for (const [jobId, side] of [[outsider, 'after'], [removed, 'after'], [removed, 'before'], [noOriginal, 'before']] as const) {
      await expect(sharedImageUrl(deps, { shareId: id, jobId, side })).rejects.toMatchObject({ code: 'NOT_FOUND' })
    }
    await expect(sharedImageUrl(deps, { shareId: id, jobId: noOriginal, side: 'after' })).resolves.toContain(noOriginal)

    await revokeWorkShare(service, owner, id)
    await expect(sharedImageUrl(deps, { shareId: id, jobId: kept, side: 'after' })).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
})
