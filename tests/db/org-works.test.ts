import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'

import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { deleteOwnJob, findOwnJob, listOwnJobs, reserveJob, setJobVisibility } from '@/core/jobs'
import { allocateOrgCredits, joinOrg, leaveOrg, removeOrgMember } from '@/core/org'
import { orgOwnerDeleteWork, orgOwnerWork, orgOwnerWorkMembers, orgOwnerWorks } from '@/core/org/works'
import { createWorkShare, listWorkShares, readWorkShare } from '@/core/work-share'

import { createMemoryStore } from '../fakes/memory-store'
import { seedTemplate } from './generation-fixtures'
import { connectAdmin, serviceClient } from './helpers'
import { serviceSupabase } from './supabase-env'
import { account, creditsOf, adminAccount, member, orgWith } from './org-fixtures'

// 企业作品 (migrations 1941–1943, Owner 2026-11-22): a work an active member pays for with org
// credits belongs to the org. It is stamped at reserve, never public, listed for the org's owner
// (removed members included), and hidden from the maker, their shares and downloads once they
// leave. Works paid with the person's own credits stay personal.

const service = serviceClient()
const rest = serviceSupabase()
let db: Client
let actor: string
let template: string
let cost: number

beforeAll(async () => {
  db = await connectAdmin()
  actor = await adminAccount(db, service)
  template = await seedTemplate(db)
  cost = (await db.query(`select (credits_cost->>'1k')::int as cost from public.templates where id = $1`, [template])).rows[0].cost
}, 60_000)

afterAll(async () => {
  await db.end()
})

async function made(userId: string, extra: { visibility?: 'public' | 'private'; againOf?: string } = {}) {
  const jobId = randomUUID()
  await reserveJob(rest, {
    jobId, userId, module: 'image', templateId: template, expectedCredits: cost, source: 'web',
    inputs: { resolution: '1k', attempt_id: randomUUID(), ...(extra.againOf ? { again_of: extra.againOf } : {}) },
    ...(extra.visibility ? { visibility: extra.visibility } : {}),
  })
  await db.query("select public.confirm_job($1, $2)", [jobId, `outputs/${userId}/${jobId}.png`])
  return jobId
}

// An edit row written straight in: the stamp trigger checks the parent whoever inserts.
const editOf = (userId: string, parent: string) =>
  db.query(
    `insert into public.generation_jobs (id, user_id, module, template_id, source, visibility, credits_cost, credit_pool, parent_job_id)
     values ($1, $2, 'image', $3, 'web', 'private', 1, 'paid', $4)`,
    [randomUUID(), userId, template, parent],
  )

const job = async (id: string) =>
  (await db.query('select org_id, org_access_ended_at, visibility, gallery_excluded, again_of from public.generation_jobs where id = $1', [id])).rows[0]

// An org whose member holds `credits` of its pool.
async function staffed(credits = cost * 4) {
  const { orgId, owner, token } = await orgWith(db, service, actor, { pool: credits * 2 })
  const staff = await member(db, service, token)
  await allocateOrgCredits(service, owner, staff, credits, randomUUID())
  return { orgId, owner, token, staff }
}

describe('stamping', () => {
  it('stamps a work paid with org credits and keeps it private', async () => {
    const { orgId, staff } = await staffed()
    const id = await made(staff, { visibility: 'public' })
    expect(await job(id)).toMatchObject({ org_id: orgId, org_access_ended_at: null, visibility: 'private', gallery_excluded: true })
  })

  it('charges an active member only from the org, never their own credits; outsiders stay personal (§6.5, #838)', async () => {
    const { orgId, owner, token } = await orgWith(db, service, actor, { pool: cost * 2 })
    const staff = await member(db, service, token, { credits: cost * 3 })
    await allocateOrgCredits(service, owner, staff, cost, randomUUID())
    // An active member's own credits are frozen: the job is the org's, their own 3 × cost stay.
    const id = await made(staff, { visibility: 'public' })
    expect(await job(id)).toMatchObject({ org_id: orgId, visibility: 'private', gallery_excluded: true })
    expect(await creditsOf(db, staff)).toBe(cost * 3)
    const outsider = await account(db, service, { credits: cost })
    expect(await job(await made(outsider))).toMatchObject({ org_id: null })
  })

  it('never takes org_id from the caller and never changes it afterwards', async () => {
    const { orgId, staff } = await staffed()
    const other = await staffed()
    const id = await made(staff)
    await expect(db.query('update public.generation_jobs set org_id = $2 where id = $1', [id, other.orgId])).rejects.toThrow('ORG_WORK_IMMUTABLE')
    await expect(db.query('update public.generation_jobs set org_id = null where id = $1', [id])).rejects.toThrow('ORG_WORK_IMMUTABLE')
    expect((await job(id)).org_id).toBe(orgId)
  })
})

describe('never public', () => {
  it('refuses the public switch and coerces any direct write back to private', async () => {
    const { staff } = await staffed()
    const id = await made(staff)
    await expect(setJobVisibility(service, { jobId: id, userId: staff, visibility: 'public' })).rejects.toMatchObject({ message: 'WORK_PRIVATE_ONLY' })
    await db.query("update public.generation_jobs set visibility = 'public' where id = $1", [id])
    await db.query('update public.generation_jobs set gallery_excluded = false where id = $1', [id]).catch(() => undefined)
    expect(await job(id)).toMatchObject({ visibility: 'private', gallery_excluded: true })
  })

  it('pulls past public org works in the backfill', async () => {
    const { orgId, staff, owner } = await staffed()
    // A job made before 1941: no stamp, public. Written with the stamp trigger off, as the old schema was.
    const id = await unstamped(() => made(staff, { visibility: 'public' }))
    // A removed member's past work is cut off by the same backfill.
    const gone = await staffed()
    const old = await unstamped(() => made(gone.staff, { visibility: 'public' }))
    await removeOrgMember(service, gone.owner, gone.staff, randomUUID())
    expect(await job(id)).toMatchObject({ org_id: null, visibility: 'public' })

    await db.query(backfillSql())
    expect(await job(id)).toMatchObject({ org_id: orgId, org_access_ended_at: null, visibility: 'private', gallery_excluded: true })
    expect((await job(old)).org_access_ended_at).not.toBeNull()
    expect((await orgOwnerWorks(service, owner)).map((w) => w.id)).toContain(id)
  })
})

// Not in a transaction: the reserve goes through PostgREST on another connection. DB test files
// run one at a time, so nothing else inserts jobs meanwhile.
async function unstamped<T>(run: () => Promise<T>): Promise<T> {
  await db.query('alter table public.generation_jobs disable trigger generation_jobs_org_work')
  try {
    return await run()
  } finally {
    await db.query('alter table public.generation_jobs enable trigger generation_jobs_org_work')
  }
}

// The migration's own backfill statement, so the test runs exactly what production ran.
function backfillSql(): string {
  const sql = readFileSync(new URL('../../supabase/migrations/1941_org_works.sql', import.meta.url), 'utf8')
  const start = sql.lastIndexOf('update public.generation_jobs j')
  return sql.slice(start)
}

describe('leaving the org', () => {
  it.each(['removed', 'left'] as const)('hides the org works from a member who %s, shares and files included', async (how) => {
    const { owner, staff } = await staffed()
    const orgWork = await made(staff)
    const shareId = await createWorkShare(service, staff, { jobIds: [orgWork] })
    expect((await readWorkShare(service, shareId))?.items).toHaveLength(1)

    if (how === 'removed') await removeOrgMember(service, owner, staff, randomUUID())
    else await leaveOrg(service, staff, randomUUID())
    // Their own credits from now on: a personal work still works normally.
    await db.query('update public.profiles set credits = $2 where id = $1', [staff, cost * 3])
    const personal = await made(staff)
    expect((await job(personal)).org_id).toBeNull()

    expect((await job(orgWork)).org_access_ended_at).not.toBeNull()
    expect(await findOwnJob(rest, staff, orgWork)).toBeNull()
    expect((await listOwnJobs(rest, staff, new Date())).done.map((j) => j.id)).toEqual([personal])
    // The link is revoked for good, so its page and image routes are gone.
    expect(await readWorkShare(service, shareId)).toBeNull()
    expect((await listWorkShares(service, staff))[0]).toMatchObject({ id: shareId, works: 0, revokedAt: expect.any(Date) })
    await expect(createWorkShare(service, staff, { jobIds: [orgWork] })).rejects.toMatchObject({ code: 'NOT_FOUND' })
    const downloaded = await db.query('select public.record_job_download($1, $2) as ok', [orgWork, staff])
    expect(downloaded.rows[0].ok).toBe(false)
    await expect(setJobVisibility(service, { jobId: orgWork, userId: staff, visibility: 'private' })).rejects.toMatchObject({ message: 'JOB_NOT_FOUND' })
    await expect(deleteOwnJob(service, { jobId: orgWork, userId: staff })).rejects.toMatchObject({ message: 'JOB_NOT_FOUND' })
    // Edit and again from the org work look missing too.
    await expect(editOf(staff, orgWork)).rejects.toThrow('PARENT_JOB_NOT_FOUND')
    expect((await job(await made(staff, { againOf: orgWork }))).again_of).toBeNull()
    // A replay of the same job (web job id, partner key) does not hand the old work back either.
    await expect(reserveJob(rest, { jobId: orgWork, userId: staff, module: 'image', templateId: template, expectedCredits: cost, source: 'web',
      inputs: { resolution: '1k', attempt_id: randomUUID() } })).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('hides them from the member’s own session reads (RLS)', async () => {
    const { owner, staff } = await staffed()
    const orgWork = await made(staff)
    const visible = async () => {
      await db.query('begin')
      await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: staff, role: 'authenticated' })])
      await db.query('set local role authenticated')
      const { rows } = await db.query('select id from public.generation_jobs where id = $1', [orgWork])
      await db.query('rollback')
      return rows.length
    }
    expect(await visible()).toBe(1)
    await removeOrgMember(service, owner, staff, randomUUID())
    expect(await visible()).toBe(0)
  })

  it('gives the works back when the person joins the org again, but never the old links', async () => {
    const { owner, token, staff } = await staffed()
    const orgWork = await made(staff)
    await db.query('update public.profiles set credits = credits + $2 where id = $1', [staff, cost])
    const personalShare = await createWorkShare(service, staff, { jobIds: [orgWork] })
    await removeOrgMember(service, owner, staff, randomUUID())
    await joinOrg(service, staff, token)
    expect((await job(orgWork)).org_access_ended_at).toBeNull()
    expect(await findOwnJob(rest, staff, orgWork)).not.toBeNull()
    expect(await readWorkShare(service, personalShare)).toBeNull()
    // Sharing again works.
    const fresh = await createWorkShare(service, staff, { jobIds: [orgWork] })
    expect((await readWorkShare(service, fresh))?.items).toHaveLength(1)
  })

  it('revokes, on rejoining, links from a leave that predates the trigger', async () => {
    const { owner, token, staff } = await staffed()
    const orgWork = await made(staff)
    const shareId = await createWorkShare(service, staff, { jobIds: [orgWork] })
    // A member removed before 1941: their link was never revoked, only hidden by the backfill.
    await db.query('alter table public.org_members disable trigger org_members_works_access')
    try {
      await removeOrgMember(service, owner, staff, randomUUID())
    } finally {
      await db.query('alter table public.org_members enable trigger org_members_works_access')
    }
    await db.query('update public.generation_jobs set org_access_ended_at = now() where id = $1', [orgWork])
    await joinOrg(service, staff, token)
    expect(await readWorkShare(service, shareId)).toBeNull()
  })

  it('leaves links without the org’s works alone', async () => {
    // A personal work made before joining (an active member only spends org credits, §6.5).
    const { owner, token } = await orgWith(db, service, actor, { pool: cost * 2 })
    const staff = await account(db, service, { credits: cost * 10 })
    const own = await made(staff)
    expect((await job(own)).org_id).toBeNull()
    await joinOrg(service, staff, token)
    const shareId = await createWorkShare(service, staff, { jobIds: [own] })
    await removeOrgMember(service, owner, staff, randomUUID())
    expect((await readWorkShare(service, shareId))?.items).toHaveLength(1)
  })
})

describe('the owner’s 企业作品', () => {
  it('lists every member’s org works, removed members included, and only the owner’s org', async () => {
    const { orgId, owner, token, staff } = await staffed()
    const second = await member(db, service, token)
    await allocateOrgCredits(service, owner, second, cost * 2, randomUUID())
    const a = await made(staff)
    const b = await made(second)
    await removeOrgMember(service, owner, staff, randomUUID())

    const works = await orgOwnerWorks(service, owner)
    expect(works.map((w) => w.id).sort()).toEqual([a, b].sort())
    expect(works.find((w) => w.id === a)).toMatchObject({ userId: staff, memberActive: false })
    expect((await orgOwnerWorks(service, owner, { member: second })).map((w) => w.id)).toEqual([b])
    const members = await orgOwnerWorkMembers(service, owner)
    expect(members).toEqual([
      expect.objectContaining({ userId: second, status: 'active', works: 1 }),
      expect.objectContaining({ userId: staff, status: 'removed', works: 1 }),
    ])
    expect(await orgOwnerWork(service, owner, a)).toMatchObject({ id: a, outputKey: `outputs/${staff}/${a}.png` })

    const stranger = await staffed()
    expect(await orgOwnerWorks(service, stranger.owner)).toHaveLength(0)
    expect(await orgOwnerWork(service, stranger.owner, a)).toBeNull()
    expect(await orgOwnerWork(service, staff, a)).toBeNull()
    void orgId
  })

  it('pages newest first with the (created_at, id) cursor', async () => {
    const { owner, staff } = await staffed(cost * 4)
    const ids = [await made(staff), await made(staff), await made(staff)]
    const first = await orgOwnerWorks(service, owner, { limit: 2 })
    expect(first.map((w) => w.id)).toEqual([ids[2], ids[1]])
    const next = await orgOwnerWorks(service, owner, { limit: 2, before: { at: first[1]!.createdAt, id: first[1]!.id } })
    expect(next.map((w) => w.id)).toEqual([ids[0]])
  })
})

const audits = async (jobId: string) =>
  (await db.query('select org_id, maker_user_id, deleted_by from public.org_work_deletions where job_id = $1', [jobId])).rows

describe('deleting', () => {
  it('refuses a member deleting an org work; the owner deletes their own, audited', async () => {
    const { orgId, owner, staff } = await staffed()
    const orgWork = await made(staff)
    await expect(deleteOwnJob(service, { jobId: orgWork, userId: staff })).rejects.toMatchObject({ message: 'ORG_WORK_DELETE_FORBIDDEN' })
    expect((await db.query('select deleted_at from public.generation_jobs where id = $1', [orgWork])).rows[0].deleted_at).toBeNull()
    // The primary admin follows the same rule: their org-funded works are org works.
    await allocateOrgCredits(service, owner, owner, cost, randomUUID())
    const ownersWork = await made(owner)
    expect((await job(ownersWork)).org_id).toBe(orgId)
    expect((await deleteOwnJob(service, { jobId: ownersWork, userId: owner })).deletedAt).not.toBeNull()
    expect(await audits(ownersWork)).toEqual([{ org_id: orgId, maker_user_id: owner, deleted_by: owner }])
  })

  it('lets the owner delete any member’s org work from 企业作品, removed members included, files and all', async () => {
    const { orgId, owner, staff } = await staffed()
    const orgWork = await made(staff)
    await removeOrgMember(service, owner, staff, randomUUID())
    const { store, upload } = createMemoryStore()
    upload(`outputs/${staff}/${orgWork}.png`, new Uint8Array([1]), 'image/png')
    const stranger = await staffed()
    await expect(orgOwnerDeleteWork({ db: rest, store }, { owner: stranger.owner, jobId: orgWork })).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(orgOwnerDeleteWork({ db: rest, store }, { owner: staff, jobId: orgWork })).rejects.toMatchObject({ code: 'NOT_FOUND' })

    await orgOwnerDeleteWork({ db: rest, store }, { owner, jobId: orgWork })
    await orgOwnerDeleteWork({ db: rest, store }, { owner, jobId: orgWork })
    expect(await store.head(`outputs/${staff}/${orgWork}.png`)).toBeNull()
    expect(await audits(orgWork)).toEqual([{ org_id: orgId, maker_user_id: staff, deleted_by: owner }])
    expect((await orgOwnerWorks(service, owner)).map((w) => w.id)).not.toContain(orgWork)
  })

  it('moves deleting and the 企业作品 view with the org when the primary admin changes', async () => {
    const { owner, token } = await staffed()
    await allocateOrgCredits(service, owner, owner, cost, randomUUID())
    const ownersWork = await made(owner)
    const next = await member(db, service, token)
    // What #840's transfer does to the org row; the works never move.
    await db.query('update public.orgs set owner_user_id = $2 where owner_user_id = $1', [owner, next])
    await expect(deleteOwnJob(service, { jobId: ownersWork, userId: owner })).rejects.toMatchObject({ message: 'ORG_WORK_DELETE_FORBIDDEN' })
    expect(await orgOwnerWorks(service, owner)).toHaveLength(0)
    expect((await orgOwnerWorks(service, next)).map((w) => w.id)).toEqual([ownersWork])
  })
})

describe('poster redraws', () => {
  it('drops a free-redraw claim against a work of an org the maker left', async () => {
    const { owner, staff } = await staffed()
    const orgWork = await made(staff)
    await removeOrgMember(service, owner, staff, randomUUID())
    const id = randomUUID()
    await db.query(
      `insert into public.generation_jobs (id, user_id, module, template_id, source, visibility, credits_cost, credit_pool, inputs)
       values ($1, $2, 'image', $3, 'web', 'private', 1, 'paid', $4)`,
      [id, staff, template, JSON.stringify({ poster: { set_id: randomUUID(), part: 0, redraw_of: orgWork } })],
    )
    const { rows } = await db.query(`select inputs -> 'poster' as poster from public.generation_jobs where id = $1`, [id])
    expect(rows[0].poster).not.toHaveProperty('redraw_of')
  })
})
