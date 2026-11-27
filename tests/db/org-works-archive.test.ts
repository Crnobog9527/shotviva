import { randomUUID } from 'node:crypto'

import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { reserveJob } from '@/core/jobs'
import { allocateOrgCredits, joinOrg } from '@/core/org'
import { archiveOrgWorksOf, archiveThumbKey, DELETED_MAKERS, findOrgWork, orgOwnerDeleteWork, orgWorkMakers, orgWorks } from '@/core/org/works'
import { workThumbKeyFor } from '@/core/storage'

import { jpeg } from '../fakes/images'
import { createMemoryStore } from '../fakes/memory-store'
import { seedTemplate } from './generation-fixtures'
import { connectAdmin, serviceClient } from './helpers'
import { serviceSupabase } from './supabase-env'
import { account, adminAccount, member, orgWith } from './org-fixtures'

// 企业作品 follow-ups (migrations 1970–1972, control 2026-11-22): a child of an org work (edit,
// again, poster redraw) is an org work whoever paid; and deleting an account never takes the org's
// works with it: they move to org_work_archive (no creator id), their files are copied under
// org-works/<org_id>/, and the owner keeps them in 企业作品 as 「已注销成员」. Personal works keep
// today's behaviour.

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
  // 2K: the org paid share (and a person's own paid credits) pay it; 1K is free credits only (1996).
  cost = (await db.query(`select (credits_cost->>'2k')::int as cost from public.templates where id = $1`, [template])).rows[0].cost
}, 60_000)

afterAll(async () => {
  await db.end()
})

async function made(userId: string, inputs: Record<string, unknown> = {}) {
  const jobId = randomUUID()
  await reserveJob(rest, { jobId, userId, module: 'image', templateId: template, expectedCredits: cost, source: 'web',
    inputs: { resolution: '2k', attempt_id: randomUUID(), ...inputs } })
  await db.query('select public.confirm_job($1, $2)', [jobId, `outputs/${userId}/${jobId}.png`])
  return jobId
}

// A row written straight in, the way an edit or a poster redraw lands after reserve_credits.
async function child(userId: string, extra: { parent?: string; inputs?: Record<string, unknown> }) {
  const id = randomUUID()
  await db.query(
    `insert into public.generation_jobs (id, user_id, module, template_id, source, visibility, credits_cost, credit_pool, parent_job_id, inputs)
     values ($1, $2, 'image', $3, 'web', 'private', 1, 'paid', $4, $5)`,
    [id, userId, template, extra.parent ?? null, JSON.stringify(extra.inputs ?? {})],
  )
  return id
}

const orgOf = async (id: string) => (await db.query('select org_id from public.generation_jobs where id = $1', [id])).rows[0]?.org_id ?? null

// A member holding one org-funded photo's worth of credits, plus `own` credits of their own.
async function staffed(own = 0) {
  const { orgId, owner, token } = await orgWith(db, service, actor, { pool: cost * 4 })
  const staff = await member(db, service, token, { credits: own })
  await allocateOrgCredits(service, owner, staff, cost, randomUUID())
  return { orgId, owner, staff, token }
}

// An active member spends only org credits (§6.5, #838): a personal work is one made before joining.
async function personalThenJoin(token: string) {
  const user = await account(db, service, { credits: cost * 3 })
  const own = await made(user)
  await joinOrg(service, user, token)
  return { user, own }
}

describe('children of org works', () => {
  it('makes an edit, an again and a poster redraw of an org work org works', async () => {
    const { orgId, owner, staff } = await staffed()
    const orgWork = await made(staff)
    await allocateOrgCredits(service, owner, staff, cost, randomUUID())
    expect(await orgOf(await child(staff, { parent: orgWork }))).toBe(orgId)
    expect(await orgOf(await made(staff, { again_of: orgWork }))).toBe(orgId)
    expect(await orgOf(await child(staff, { inputs: { poster: { set_id: randomUUID(), part: 0, redraw_of: orgWork } } }))).toBe(orgId)
  })

  it('leaves children of personal works personal, and ignores a malformed redraw source', async () => {
    const { token } = await staffed()
    const { user: staff, own } = await personalThenJoin(token)
    expect(await orgOf(own)).toBeNull()
    expect(await orgOf(await child(staff, { parent: own }))).toBeNull()
    expect(await orgOf(await child(staff, { inputs: { poster: { set_id: randomUUID(), part: 0, redraw_of: 'not-a-uuid' } } }))).toBeNull()
  })

  it('never inherits from someone else’s work', async () => {
    const { staff } = await staffed()
    const orgWork = await made(staff)
    const other = await staffed(cost * 2)
    expect(await orgOf(await child(other.staff, { inputs: { poster: { set_id: randomUUID(), part: 0, redraw_of: orgWork } } }))).toBeNull()
  })
})

const deleteAuthUser = (id: string) => db.query('delete from auth.users where id = $1', [id])
const archiveRow = async (jobId: string) =>
  (await db.query('select org_id, output_key, reason, deleted_at, deleted_by from public.org_work_archive where job_id = $1', [jobId])).rows[0]

describe('account deletion', () => {
  it('moves the org works into the org, files copied, personal works going as before', async () => {
    const { orgId, owner, token } = await staffed()
    const { user: staff, own: personal } = await personalThenJoin(token)
    await allocateOrgCredits(service, owner, staff, cost, randomUUID())
    const orgWork = await made(staff)
    expect(await orgOf(personal)).toBeNull()
    expect(await orgOf(orgWork)).toBe(orgId)
    const { store, upload } = createMemoryStore()
    upload(`outputs/${staff}/${orgWork}.png`, new Uint8Array([1]), 'image/png')
    upload(workThumbKeyFor(staff, orgWork, 'paid'), new Uint8Array([2]), 'image/webp')

    expect(await archiveOrgWorksOf({ db: rest, store }, staff)).toBe(1)
    expect(await archiveOrgWorksOf({ db: rest, store }, staff)).toBe(0)
    const archived = `org-works/${orgId}/${orgWork}.png`
    expect(await store.head(archived)).not.toBeNull()
    expect(await store.head(archiveThumbKey(archived))).not.toBeNull()
    // Until the account is gone the work is listed once, live.
    expect((await orgWorks(service, owner)).filter((w) => w.id === orgWork)).toHaveLength(1)

    await deleteAuthUser(staff)
    expect((await db.query('select count(*)::int as n from public.generation_jobs where user_id = $1', [staff])).rows[0].n).toBe(0)
    expect(await archiveRow(orgWork)).toMatchObject({ org_id: orgId, output_key: archived, reason: 'account_deleted', deleted_at: null })
    expect(await archiveRow(personal)).toBeUndefined()

    expect(await orgWorks(service, owner)).toEqual([expect.objectContaining({ id: orgWork, userId: null, memberActive: false })])
    expect(await orgWorks(service, owner, { member: DELETED_MAKERS })).toHaveLength(1)
    expect(await orgWorkMakers(service, owner)).toEqual([expect.objectContaining({ userId: null, status: 'deleted', works: 1 })])
    expect(await findOrgWork(service, owner, orgWork)).toMatchObject({ userId: null, outputKey: archived })
    // The code deployed before 1972 reads 1943's functions, which never return a null maker.
    const old = await db.query('select count(*)::int as n from public.org_owner_works($1)', [owner])
    expect(old.rows[0].n).toBe(0)
  })

  it('keeps the row when an account is removed some other way (the Auth dashboard), files where they were', async () => {
    const { orgId, owner, staff } = await staffed()
    const orgWork = await made(staff)
    await deleteAuthUser(staff)
    expect(await archiveRow(orgWork)).toMatchObject({ org_id: orgId, output_key: `outputs/${staff}/${orgWork}.png`, reason: 'job_deleted' })
    expect((await orgWorks(service, owner)).map((w) => w.id)).toEqual([orgWork])
  })

  it('lets only the owner delete an archived work, audited once with no maker', async () => {
    const { orgId, owner, staff } = await staffed()
    const orgWork = await made(staff)
    const { store, upload } = createMemoryStore()
    upload(`outputs/${staff}/${orgWork}.png`, new Uint8Array([1]), 'image/png')
    await archiveOrgWorksOf({ db: rest, store }, staff)
    await deleteAuthUser(staff)
    const stranger = await staffed()
    await expect(orgOwnerDeleteWork({ db: rest, store }, { owner: stranger.owner, jobId: orgWork })).rejects.toMatchObject({ code: 'NOT_FOUND' })

    await orgOwnerDeleteWork({ db: rest, store }, { owner, jobId: orgWork })
    await orgOwnerDeleteWork({ db: rest, store }, { owner, jobId: orgWork })
    expect(await store.head(`org-works/${orgId}/${orgWork}.png`)).toBeNull()
    expect(await archiveRow(orgWork)).toMatchObject({ deleted_by: owner })
    const audit = await db.query('select maker_user_id, deleted_by from public.org_work_deletions where job_id = $1', [orgWork])
    expect(audit.rows).toEqual([{ maker_user_id: null, deleted_by: owner }])
    expect(await orgWorks(service, owner)).toHaveLength(0)
    expect(await findOrgWork(service, owner, orgWork)).toBeNull()
  })

  it('skips works already deleted', async () => {
    const { owner, staff } = await staffed()
    const orgWork = await made(staff)
    await orgOwnerDeleteWork({ db: rest, store: createMemoryStore().store }, { owner, jobId: orgWork })
    await deleteAuthUser(staff)
    expect(await archiveRow(orgWork)).toBeUndefined()
  })

  it('refuses an org’s primary admin and an account with an org work still being made, before anything', async () => {
    const { owner, staff } = await staffed()
    const store = createMemoryStore().store
    await expect(archiveOrgWorksOf({ db: rest, store }, owner)).rejects.toMatchObject({ code: 'ACCOUNT_OWNS_ORG' })
    const running = randomUUID()
    await reserveJob(rest, { jobId: running, userId: staff, module: 'image', templateId: template, expectedCredits: cost, source: 'web',
      inputs: { resolution: '2k', attempt_id: randomUUID() } })
    await expect(archiveOrgWorksOf({ db: rest, store }, staff)).rejects.toMatchObject({ code: 'CONFLICT' })
    expect(await archiveRow(running)).toBeUndefined()
    // A row left running past the sweeper's day is dead and no longer blocks.
    await db.query("update public.generation_jobs set created_at = now() - interval '25 hours' where id = $1", [running])
    await expect(archiveOrgWorksOf({ db: rest, store }, staff)).resolves.toBe(0)
  })

  it('drops a work deleted between two tries, and serves a copied work from its copy meanwhile', async () => {
    const { orgId, owner, staff } = await staffed()
    await allocateOrgCredits(service, owner, staff, cost, randomUUID())
    const kept = await made(staff)
    const dropped = await made(staff)
    const { store, upload } = createMemoryStore()
    for (const id of [kept, dropped]) upload(`outputs/${staff}/${id}.png`, new Uint8Array([1]), 'image/png')
    expect(await archiveOrgWorksOf({ db: rest, store }, staff)).toBe(2)
    // While the account is still there the file route knows where the copy is.
    expect(await findOrgWork(service, owner, kept)).toMatchObject({ userId: staff, archiveKey: `org-works/${orgId}/${kept}.png` })
    await orgOwnerDeleteWork({ db: rest, store }, { owner, jobId: dropped })
    expect(await archiveRow(dropped)).toMatchObject({ deleted_by: owner })
    // Its copy goes with it.
    expect(await store.head(`org-works/${orgId}/${dropped}.png`)).toBeNull()
    expect(await archiveOrgWorksOf({ db: rest, store }, staff)).toBe(0)
    await deleteAuthUser(staff)
    expect((await orgWorks(service, owner)).map((w) => w.id)).toEqual([kept])
    // No creator id survives in the audit of the earlier delete.
    const audit = await db.query('select maker_user_id from public.org_work_deletions where job_id = $1', [dropped])
    expect(audit.rows).toEqual([{ maker_user_id: null }])
  })

  it('keeps a free org work’s protected small copy, making it when missing', async () => {
    const { orgId, staff } = await staffed()
    const parent = await made(staff)
    const free = randomUUID()
    await db.query(
      `insert into public.generation_jobs (id, user_id, module, template_id, source, status, visibility, credits_cost, credit_pool, parent_job_id, output_key, finished_at)
       values ($1, $2, 'image', $3, 'web', 'succeeded', 'public', 1, 'free', $4, $5, now())`,
      [free, staff, template, parent, `outputs/${staff}/${free}.png`],
    )
    expect(await orgOf(free)).toBe(orgId)
    const { store, upload } = createMemoryStore()
    upload(`outputs/${staff}/${parent}.png`, new Uint8Array([1]), 'image/png')
    upload(`outputs/${staff}/${free}.png`, await jpeg(64, 80), 'image/png')
    await archiveOrgWorksOf({ db: rest, store }, staff)
    expect(await store.head(archiveThumbKey(`org-works/${orgId}/${free}.png`))).not.toBeNull()
  })

  it('copies many works a few at a time, chunk by chunk, keeping the marks of a chunk that failed', async () => {
    const total = 50
    const { orgId, owner, token } = await orgWith(db, service, actor, { pool: cost * total })
    const staff = await member(db, service, token)
    await allocateOrgCredits(service, owner, staff, cost * total, randomUUID())
    const ids: string[] = []
    for (let i = 0; i < total; i++) ids.push(await made(staff))
    const order = (await db.query<{ job_id: string }>('select job_id from public.archive_org_works($1)', [staff])).rows.map((r) => r.job_id)
    // The last work handed out sits in the second chunk (48 per chunk); its file is missing.
    const missing = order[order.length - 1]!
    const { store, upload } = createMemoryStore()
    for (const id of ids) if (id !== missing) upload(`outputs/${staff}/${id}.png`, new Uint8Array([1]), 'image/png')
    await expect(archiveOrgWorksOf({ db: rest, store }, staff)).rejects.toThrow()
    const marked = async () =>
      (await db.query('select count(*)::int as n from public.org_work_archive where job_id = any($1) and copied_at is not null', [ids])).rows[0].n as number
    expect(await marked()).toBe(total - 1)
    upload(`outputs/${staff}/${missing}.png`, new Uint8Array([1]), 'image/png')
    expect(await archiveOrgWorksOf({ db: rest, store }, staff)).toBe(1)
    expect(await archiveOrgWorksOf({ db: rest, store }, staff)).toBe(0)
    for (const id of ids) expect(await store.head(`org-works/${orgId}/${id}.png`)).not.toBeNull()
  })

  it('forgets the creator in the audit also when the account goes without the archive step', async () => {
    const { owner, staff } = await staffed()
    const orgWork = await made(staff)
    await orgOwnerDeleteWork({ db: rest, store: createMemoryStore().store }, { owner, jobId: orgWork })
    await deleteAuthUser(staff)
    const audit = await db.query('select maker_user_id from public.org_work_deletions where job_id = $1', [orgWork])
    expect(audit.rows).toEqual([{ maker_user_id: null }])
  })
})

