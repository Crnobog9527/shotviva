import { randomUUID } from 'node:crypto'

import type { Client } from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'

import { callRpc } from '@/core/billing'
import { reserveJob } from '@/core/jobs'

import { anonClient, connectAdmin, createPricedTemplate, createUser, profileOf, serviceClient } from './helpers'
import { adminAccount, member, orgWith } from './org-fixtures'

// Site-wide generation lanes and the stale-job sweep (queue-fairness Q3, SQL 1760). The lane
// numbers are shrunk for the test so a handful of slots fills a lane; the real row is put back.

const service = serviceClient()
let db: Client
let saved: unknown
let actor: string

const SMALL = {
  lanes: { gpt: { per_minute: 100, inflight: 100 }, seedream: { per_minute: 100, inflight: 100 }, other: { per_minute: 100, inflight: 4 } },
  single_reserve_pct: 50, org_inflight_max: 2, orgs_share_pct: 50, slot_ttl_seconds: 360,
}

const grant = z.object({ granted: z.boolean(), reason: z.string().optional() })
const acquire = (userId: string, kind: 'single' | 'batch' = 'single', attemptId = randomUUID(), lane = 'other') =>
  callRpc(service, 'acquire_generation_slot', { p_attempt_id: attemptId, p_lane: lane, p_user_id: userId, p_kind: kind }, grant)
const release = (attemptId: string) => callRpc(service, 'release_generation_slot', { p_attempt_id: attemptId }, z.boolean())
const setLanes = (value: unknown) =>
  db.query("insert into public.system_settings (key, value) values ('generation_lanes', $1) on conflict (key) do update set value = excluded.value", [JSON.stringify(value)])

beforeAll(async () => {
  db = await connectAdmin()
  actor = await adminAccount(db, service)
  saved = (await db.query("select value from public.system_settings where key = 'generation_lanes'")).rows[0]?.value
})

afterAll(async () => {
  if (saved) await setLanes(saved)
  await db.query('delete from public.generation_slots')
  await db.end()
})

beforeEach(async () => {
  await db.query('delete from public.generation_slots')
  await setLanes(SMALL)
})

describe('acquire_generation_slot', () => {
  it('fills a lane up to its in-flight cap, keeping the single-photo reserve from batches', async () => {
    const user = await createUser(db)
    expect(await acquire(user, 'batch')).toEqual({ granted: true })
    expect(await acquire(user, 'batch')).toEqual({ granted: true })
    // 50% reserve: batches stop at 2 of 4.
    expect(await acquire(user, 'batch')).toEqual({ granted: false, reason: 'lane_full' })
    expect(await acquire(user, 'single')).toEqual({ granted: true })
    expect(await acquire(user, 'single')).toEqual({ granted: true })
    expect(await acquire(user, 'single')).toEqual({ granted: false, reason: 'lane_full' })
    // Another lane is untouched.
    expect(await acquire(user, 'single', randomUUID(), 'gpt')).toEqual({ granted: true })
  })

  it('grants a repeat of the same attempt without a second slot, and a released slot frees room', async () => {
    const user = await createUser(db)
    const ids = [randomUUID(), randomUUID(), randomUUID(), randomUUID()]
    for (const id of ids) expect((await acquire(user, 'single', id)).granted).toBe(true)
    expect((await acquire(user, 'single', ids[0])).granted).toBe(true)
    expect((await acquire(user)).granted).toBe(false)
    await release(ids[0]!)
    await release(ids[0]!)
    expect((await acquire(user)).granted).toBe(true)
    const { rows } = await db.query<{ n: number }>("select count(*)::int as n from public.generation_slots where lane = 'other'")
    expect(rows[0]?.n).toBe(5)
  })

  it('does not count a slot past its expiry (a function that died)', async () => {
    const user = await createUser(db)
    for (let i = 0; i < 4; i++) await acquire(user)
    expect((await acquire(user)).granted).toBe(false)
    await db.query("update public.generation_slots set expires_at = now() - interval '1 second', acquired_at = now() - interval '2 minutes'")
    expect((await acquire(user)).granted).toBe(true)
  })

  it('caps the slots taken per minute, released or not', async () => {
    await setLanes({ ...SMALL, lanes: { ...SMALL.lanes, other: { per_minute: 3, inflight: 10 } } })
    const user = await createUser(db)
    for (let i = 0; i < 3; i++) {
      const id = randomUUID()
      expect((await acquire(user, 'single', id)).granted).toBe(true)
      await release(id)
    }
    expect(await acquire(user)).toEqual({ granted: false, reason: 'lane_rate' })
    await db.query("update public.generation_slots set acquired_at = now() - interval '61 seconds'")
    expect((await acquire(user)).granted).toBe(true)
  })

  it('holds one org to org_inflight_max across its members, leaving everyone else alone', async () => {
    await setLanes({ ...SMALL, lanes: { ...SMALL.lanes, other: { per_minute: 100, inflight: 20 } } })
    const { token } = await orgWith(db, service, actor)
    const a = await member(db, service, token)
    const b = await member(db, service, token)
    const outsider = await createUser(db)
    expect((await acquire(a)).granted).toBe(true)
    expect((await acquire(b, 'single', randomUUID(), 'gpt')).granted).toBe(true)
    // The cap spans lanes: the org already holds two.
    expect(await acquire(a)).toEqual({ granted: false, reason: 'org_full' })
    expect(await acquire(b)).toEqual({ granted: false, reason: 'org_full' })
    expect((await acquire(outsider)).granted).toBe(true)
  })

  it('never lets one org pass its cap with requests racing in different lanes', async () => {
    await setLanes({ ...SMALL, org_inflight_max: 3, lanes: { gpt: { per_minute: 1000, inflight: 100 }, seedream: { per_minute: 1000, inflight: 100 }, other: { per_minute: 1000, inflight: 100 } } })
    const { token } = await orgWith(db, service, actor)
    const staff = await Promise.all([member(db, service, token), member(db, service, token), member(db, service, token)])
    const lanes = ['gpt', 'seedream', 'other'] as const
    const results = await Promise.all(Array.from({ length: 12 }, (_, i) => acquire(staff[i % 3]!, 'single', randomUUID(), lanes[i % 3])))
    expect(results.filter((result) => result.granted)).toHaveLength(3)
    expect(results.filter((result) => !result.granted).every((result) => result.reason === 'org_full')).toBe(true)
  })

  it('keeps all orgs together under orgs_share_pct of a lane’s batch slots', async () => {
    await setLanes({ ...SMALL, org_inflight_max: 10, lanes: { ...SMALL.lanes, other: { per_minute: 100, inflight: 8 } } })
    // Batch cap 4 (50% reserve), orgs' share 50% of it = 2.
    const one = await member(db, service, (await orgWith(db, service, actor)).token)
    const two = await member(db, service, (await orgWith(db, service, actor)).token)
    const outsider = await createUser(db)
    expect((await acquire(one, 'batch')).granted).toBe(true)
    expect((await acquire(two, 'batch')).granted).toBe(true)
    expect(await acquire(one, 'batch')).toEqual({ granted: false, reason: 'orgs_share' })
    // A single photo of an org member and anyone's batch still go.
    expect((await acquire(one, 'single')).granted).toBe(true)
    expect((await acquire(outsider, 'batch')).granted).toBe(true)
  })

  it('falls back to the defaults on a broken settings row, never to no limit', async () => {
    await setLanes({ lanes: { other: { inflight: 'lots' } }, single_reserve_pct: 500 })
    const settings = await callRpc(service, 'generation_lane_settings', {}, z.record(z.string(), z.unknown()))
    expect(settings).toMatchObject({
      single_reserve_pct: 20, org_inflight_max: 24, orgs_share_pct: 60,
      lanes: { other: { inflight: 20, per_minute: 120 }, gpt: { inflight: 100, per_minute: 120 }, seedream: { inflight: 120, per_minute: 300 } },
    })
  })

  it('is not callable by client roles', async () => {
    const response = await anonClient().rpc('acquire_generation_slot', { p_attempt_id: randomUUID(), p_lane: 'other', p_user_id: randomUUID(), p_kind: 'single' })
    expect(response.error).not.toBeNull()
  })
})

describe('sweep_stale_generation_jobs', () => {
  const sweep = (olderThan = '15 minutes') => callRpc(service, 'sweep_stale_generation_jobs', { p_older_than: olderThan, p_limit: 200 }, z.number())
  const sweepSince = (sql: string) =>
    db.query(`insert into public.system_settings (key, value) values ('generation_sweep_since', to_jsonb(${sql}))
      on conflict (key) do update set value = excluded.value`)
  let savedSince: unknown

  beforeAll(async () => {
    savedSince = (await db.query("select value from public.system_settings where key = 'generation_sweep_since'")).rows[0]?.value
  })
  afterAll(async () => {
    if (savedSince) await db.query("update public.system_settings set value = $1 where key = 'generation_sweep_since'", [JSON.stringify(savedSince)])
  })
  // As if the feature had shipped two days ago; each test narrows it where it needs to.
  beforeEach(() => sweepSince("now() - interval '2 days'"))

  const runningJob = async (user: string, templateId: string, age: string) => {
    const jobId = randomUUID()
    await reserveJob(service, { jobId, userId: user, module: 'image', templateId, source: 'web', inputs: { resolution: '1k' } })
    await db.query(`update public.generation_jobs set created_at = now() - interval '${age}' where id = $1`, [jobId])
    return jobId
  }
  const statusOf = async (jobId: string) =>
    (await db.query<{ status: string }>('select status from public.generation_jobs where id = $1', [jobId])).rows[0]?.status

  it('never refunds jobs older than 24 hours or started before the feature shipped', async () => {
    const user = await createUser(db, { credits: 30 })
    const templateId = await createPricedTemplate(db, { '1k': 3, '2k': 4, '4k': 5 })
    const ancient = await runningJob(user, templateId, '30 hours')
    const beforeShip = await runningJob(user, templateId, '3 hours')
    await sweepSince("now() - interval '2 hours'")
    await sweep()
    expect(await statusOf(ancient)).toBe('running')
    expect(await statusOf(beforeShip)).toBe('running')
    // Without the row nothing is swept at all.
    const inWindow = await runningJob(user, templateId, '1 hour')
    await db.query("delete from public.system_settings where key = 'generation_sweep_since'")
    expect(await sweep()).toBe(0)
    expect(await statusOf(inWindow)).toBe('running')
    // Not left for the other tests: they would sweep them.
    await db.query("update public.generation_jobs set status = 'failed', error_code = 'TEST' where id = any($1)", [[ancient, beforeShip, inWindow]])
  })

  it('refunds a job left running past the limit exactly once and leaves recent ones', async () => {
    const user = await createUser(db, { credits: 10 })
    const templateId = await createPricedTemplate(db, { '1k': 3, '2k': 4, '4k': 5 })
    const stale = randomUUID()
    const fresh = randomUUID()
    for (const jobId of [stale, fresh]) {
      await reserveJob(service, { jobId, userId: user, module: 'image', templateId, source: 'web', inputs: { resolution: '1k' } })
    }
    expect((await profileOf(db, user)).credits).toBe(4)
    await db.query("update public.generation_jobs set created_at = now() - interval '20 minutes' where id = $1", [stale])

    expect(await sweep()).toBeGreaterThanOrEqual(1)
    expect(await sweep()).toBe(0)
    const { rows } = await db.query<{ id: string; status: string; error_code: string | null }>(
      'select id, status, error_code from public.generation_jobs where id = any($1)', [[stale, fresh]])
    expect(rows.find((row) => row.id === stale)).toMatchObject({ status: 'failed', error_code: 'STALE_TIMEOUT' })
    expect(rows.find((row) => row.id === fresh)).toMatchObject({ status: 'running' })
    // One refund of 3, not two.
    expect((await profileOf(db, user)).credits).toBe(7)
  })

  it('refuses a window shorter than any function can live', async () => {
    await expect(sweep('5 minutes')).rejects.toThrow()
  })

  it('drops slot rows nobody counts any more', async () => {
    const user = await createUser(db)
    const id = randomUUID()
    await acquire(user, 'single', id)
    await release(id)
    await db.query("update public.generation_slots set acquired_at = now() - interval '11 minutes' where attempt_id = $1", [id])
    await sweep()
    const { rows } = await db.query('select 1 from public.generation_slots where attempt_id = $1', [id])
    expect(rows).toHaveLength(0)
  })
})
