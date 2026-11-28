import { randomUUID } from 'node:crypto'

import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { listOwnJobs, reserveJob } from '@/core/jobs'
import { allocateOrgCredits, joinOrg, removeOrgMember } from '@/core/org'
import { archiveOrgWorksOf, DELETED_MAKERS, listCompanyPhotos, ME, PERSONAL, readCompanySeat } from '@/core/org/works'

import { createMemoryStore } from '../fakes/memory-store'
import { seedTemplate } from './generation-fixtures'
import { connectAdmin, serviceClient } from './helpers'
import { account, adminAccount, member, orgWith } from './org-fixtures'
import { serviceSupabase } from './supabase-env'

// 作品页就是企业作品 (migration 2037, Owner 2026-11-28): while an org's workspace is on, every
// active member's Photos page reads the whole company's works plus their own personal ones.
// Nobody else reads another person's work through these functions: not a stranger, not a removed
// member, not a member of an org whose workspace is off.

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
  // 2K: paid by the org's paid share, or by a person's own paid credits.
  cost = (await db.query(`select (credits_cost->>'2k')::int as cost from public.templates where id = $1`, [template])).rows[0].cost
}, 60_000)

afterAll(async () => {
  await db.end()
})

let tick = 0
// A finished work; each one a second later than the last, so the order is known.
async function made(userId: string) {
  const jobId = randomUUID()
  await reserveJob(rest, { jobId, userId, module: 'image', templateId: template, expectedCredits: cost, source: 'web', inputs: { resolution: '2k', attempt_id: randomUUID() } })
  await db.query('select public.confirm_job($1, $2)', [jobId, `outputs/${userId}/${jobId}.png`])
  await db.query(`update public.generation_jobs set created_at = now() - interval '1 hour' + ($2 || ' seconds')::interval where id = $1`, [jobId, String(++tick)])
  return jobId
}

const ids = async (user: string, filter: string | null = null) => (await listCompanyPhotos(rest, user, { filter })).works.map((w) => w.id)
const setStatus = (orgId: string, status: 'active' | 'suspended') => db.query('update public.orgs set status = $2 where id = $1', [orgId, status])

// An org with an owner and two staff, each holding org credits. `veteran` joined with a personal
// work already made; `peer` has a personal work nobody else may see (made before joining too).
async function company() {
  const { orgId, owner, token } = await orgWith(db, service, actor, { pool: cost * 40 })
  const veteran = await account(db, service, { plan: 'pro_monthly' })
  const before = await made(veteran)
  await joinOrg(service, veteran, token)
  const peer = await account(db, service, { plan: 'pro_monthly' })
  const peerPersonal = await made(peer)
  await joinOrg(service, peer, token)
  for (const who of [owner, veteran, peer]) await allocateOrgCredits(service, owner, who, cost * 6, randomUUID())
  const works = { owner: await made(owner), veteran: await made(veteran), peer: await made(peer) }
  return { orgId, owner, token, veteran, peer, before, peerPersonal, works }
}

describe('who sees the company view', () => {
  it('shows every active member the whole company\'s works and their own personal ones, newest first', async () => {
    const c = await company()
    expect(await readCompanySeat(rest, c.owner)).toEqual({ orgId: c.orgId, owner: true })
    expect(await readCompanySeat(rest, c.veteran)).toEqual({ orgId: c.orgId, owner: false })
    // The staff member: all three org works, then their own personal work; never the peer's personal one.
    expect(await ids(c.veteran)).toEqual([c.works.peer, c.works.veteran, c.works.owner, c.before])
    expect(await ids(c.peer)).toEqual([c.works.peer, c.works.veteran, c.works.owner, c.peerPersonal])
    // The owner has no personal works: the org works only.
    expect(await ids(c.owner)).toEqual([c.works.peer, c.works.veteran, c.works.owner])
    const page = await listCompanyPhotos(rest, c.veteran)
    expect(page.total).toBe(4)
    expect(page.works.find((w) => w.id === c.before)).toMatchObject({ orgWork: false, userId: c.veteran })
    expect(page.works.find((w) => w.id === c.works.peer)).toMatchObject({ orgWork: true, userId: c.peer, memberActive: true })
  })

  it('narrows by maker: mine, a member, personal', async () => {
    const c = await company()
    expect(await ids(c.veteran, ME)).toEqual([c.works.veteran])
    expect(await ids(c.veteran, c.peer)).toEqual([c.works.peer])
    expect(await ids(c.veteran, PERSONAL)).toEqual([c.before])
    // Asking for a colleague by id never reaches that colleague's personal works.
    expect(await ids(c.veteran, c.peer)).not.toContain(c.peerPersonal)
    expect((await listCompanyPhotos(rest, c.veteran, { filter: c.peer })).total).toBe(1)
  })

  it('gives nothing to someone outside the org, or in another org', async () => {
    const c = await company()
    const stranger = await account(db, service, { plan: 'pro_monthly' })
    const strangerWork = await made(stranger)
    expect(await readCompanySeat(rest, stranger)).toBeNull()
    expect(await ids(stranger)).toEqual([])
    expect((await listCompanyPhotos(rest, stranger, { filter: c.peer })).total).toBe(0)
    const other = await orgWith(db, service, actor, { pool: cost * 4 })
    const outsider = await member(db, service, other.token)
    expect(await ids(outsider)).toEqual([])
    expect(await ids(outsider, c.peer)).toEqual([])
    // The personal page is what it was.
    expect((await listOwnJobs(rest, stranger, new Date())).done.map((j) => j.id)).toEqual([strangerWork])
  })
})

describe('leaving and the workspace switch', () => {
  it('a removed member reads nothing of the company at once and keeps only personal works on the personal page; the company keeps theirs', async () => {
    const c = await company()
    await removeOrgMember(service, c.owner, c.veteran, randomUUID())
    expect(await readCompanySeat(rest, c.veteran)).toBeNull()
    expect(await ids(c.veteran)).toEqual([])
    expect(await ids(c.veteran, PERSONAL)).toEqual([])
    expect((await listOwnJobs(rest, c.veteran, new Date())).done.map((j) => j.id)).toEqual([c.before])
    // Their org work stays in the company view, marked as a member who left; their personal work is not there.
    const left = (await listCompanyPhotos(rest, c.peer)).works
    expect(left.map((w) => w.id)).toEqual([c.works.peer, c.works.veteran, c.works.owner, c.peerPersonal])
    expect(left.find((w) => w.id === c.works.veteran)).toMatchObject({ memberActive: false, userId: c.veteran })
    // Back in the org: the company view returns, their own org work with it.
    await joinOrg(service, c.veteran, c.token)
    expect(await ids(c.veteran)).toEqual([c.works.peer, c.works.veteran, c.works.owner, c.before])
  })

  it('with the workspace off every member gets the personal page; switched back on, the company view returns unchanged', async () => {
    const c = await company()
    const all = await ids(c.veteran)
    await setStatus(c.orgId, 'suspended')
    for (const who of [c.owner, c.veteran, c.peer]) {
      expect(await readCompanySeat(rest, who)).toBeNull()
      expect(await ids(who)).toEqual([])
    }
    // The personal page: a member's own works, org-paid ones included while they are still a member.
    expect((await listOwnJobs(rest, c.veteran, new Date())).done.map((j) => j.id)).toEqual([c.works.veteran, c.before])
    await setStatus(c.orgId, 'active')
    expect(await ids(c.veteran)).toEqual(all)
  })

  it('lists a deleted account\'s archived works for the members, under their own filter', async () => {
    const c = await company()
    await archiveOrgWorksOf({ db: rest, store: createMemoryStore().store }, c.peer)
    await db.query('delete from auth.users where id = $1', [c.peer])
    const rows = (await listCompanyPhotos(rest, c.veteran)).works
    expect(rows.find((w) => w.id === c.works.peer)).toMatchObject({ archived: true, userId: null, orgWork: true })
    expect(rows.map((w) => w.id)).not.toContain(c.peerPersonal)
    expect(await ids(c.veteran, DELETED_MAKERS)).toEqual([c.works.peer])
  })
})

describe('pages', () => {
  it('pages by cursor, each work once, and reads back down to a cursor', async () => {
    const { orgId, owner, token } = await orgWith(db, service, actor, { pool: cost * 200 })
    const staff = await member(db, service, token)
    await allocateOrgCredits(service, owner, staff, cost * 60, randomUUID())
    await allocateOrgCredits(service, owner, owner, cost * 60, randomUUID())
    const all: string[] = []
    for (let n = 0; n < 51; n++) all.unshift(await made(n % 2 ? staff : owner))
    const first = await listCompanyPhotos(rest, staff)
    expect(first.works.map((w) => w.id)).toEqual(all.slice(0, 48))
    expect(first.total).toBe(51)
    expect(first.next).not.toBeNull()
    const second = await listCompanyPhotos(rest, staff, { until: first.next })
    expect(second.works.map((w) => w.id)).toEqual(all)
    expect(second.next).toBeNull()
    expect(orgId).toBeTruthy()
  }, 120_000)
})

describe('grants', () => {
  it('are the service role\'s only', async () => {
    for (const fn of ['public.org_member_photos(uuid, text, uuid, integer, timestamptz, uuid, timestamptz, uuid)', 'public.org_member_photos_count(uuid, text, uuid)']) {
      const { rows } = await db.query(
        "select has_function_privilege('anon', $1, 'execute') as anon, has_function_privilege('authenticated', $1, 'execute') as auth, has_function_privilege('service_role', $1, 'execute') as service",
        [fn],
      )
      expect(rows[0]).toEqual({ anon: false, auth: false, service: true })
    }
  })
})
