import { randomUUID } from 'node:crypto'

import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { listOrgWorks } from '@/core/admin/org-works'
import { loadOrgInviteToken } from '@/core/admin/orgs'
import { refundJob, reserveJob } from '@/core/jobs'
import { allocateOrgCredits, removeOrgMember } from '@/core/org'

import { seedTemplate } from './generation-fixtures'
import { connectAdmin, serviceClient } from './helpers'
import { serviceSupabase } from './supabase-env'
import { account, adminAccount, inviteToken, member, orgWith } from './org-fixtures'

// 企业作品 in the admin (/admin/orgs/[id]): every work stamped with the org, failed and running
// ones included, newest first; filters by member, status and work id; the paying pool read from
// the reserve's draw rows and what a refund gave back. Read with the service role, the way the
// page reads it.

const service = serviceClient()
const rest = serviceSupabase()
let db: Client
let template: string
let cost: number
let orgId: string
let owner: string
let staff: string
let other: string
let ok: string
let failed: string
let running: string
let personal: string
let foreign: string

async function reserve(userId: string) {
  const jobId = randomUUID()
  await reserveJob(rest, { jobId, userId, module: 'image', templateId: template, expectedCredits: cost, source: 'web',
    inputs: { resolution: '2k', attempt_id: randomUUID() } })
  return jobId
}

async function made(userId: string) {
  const jobId = await reserve(userId)
  await db.query('select public.confirm_job($1, $2)', [jobId, `outputs/${userId}/${jobId}.png`])
  return jobId
}

beforeAll(async () => {
  db = await connectAdmin()
  const actor = await adminAccount(db, service)
  template = await seedTemplate(db)
  // 2K: the org paid share pays it (1K is the promotion share's, 1996).
  cost = (await db.query(`select (credits_cost->>'2k')::int as cost from public.templates where id = $1`, [template])).rows[0].cost
  const org = await orgWith(db, service, actor, { pool: cost * 10 })
  orgId = org.orgId
  owner = org.owner
  staff = await member(db, service, org.token)
  other = await member(db, service, org.token)
  await allocateOrgCredits(service, org.owner, staff, cost * 3, randomUUID())
  await allocateOrgCredits(service, org.owner, other, cost, randomUUID())
  ok = await made(staff)
  failed = await reserve(staff)
  await refundJob(rest, { jobId: failed, errorCode: 'PROVIDER_TIMEOUT' })
  running = await reserve(other)
  // A work made with the member's own credits before joining any org is not the org's.
  const outsider = await account(db, service, { credits: cost })
  personal = await made(outsider)
  // Another org's work never shows here.
  const second = await orgWith(db, service, actor, { pool: cost * 2 })
  const stranger = await member(db, service, second.token)
  await allocateOrgCredits(service, second.owner, stranger, cost, randomUUID())
  foreign = await made(stranger)
}, 120_000)

afterAll(async () => {
  await db.end()
})

const ids = (page: Awaited<ReturnType<typeof listOrgWorks>>) => page.items.map((w) => w.id)

describe('admin 企业作品', () => {
  it('lists every work of the org, newest first, and nothing else', async () => {
    const page = await listOrgWorks(rest, orgId, {})
    expect(ids(page)).toEqual([running, failed, ok])
    expect(ids(page)).not.toContain(personal)
    expect(ids(page)).not.toContain(foreign)
    expect(page.nextCursor).toBeNull()
  })

  it('reports status, the org pool that paid, the refund and the template name', async () => {
    const page = await listOrgWorks(rest, orgId, {})
    const byId = new Map(page.items.map((w) => [w.id, w]))
    expect(byId.get(ok)).toMatchObject({ status: 'succeeded', creditsCost: cost, credits: { orgPaid: cost, orgPromo: 0, personal: 0 }, refunded: 0, userId: staff })
    expect(byId.get(ok)!.templateName).toEqual(expect.any(String))
    expect(byId.get(failed)).toMatchObject({ status: 'failed', errorCode: 'PROVIDER_TIMEOUT', refunded: cost, credits: { orgPaid: cost } })
    expect(byId.get(running)).toMatchObject({ status: 'running', userId: other })
  })

  it('reads a promotion-share draw as the org promotion pool', async () => {
    // The draw row the #836 reserve writes, set straight in: this checks the read, not the reserve.
    const promo = await made(staff)
    await db.query('delete from public.org_held_draws where debit_key = $1', [`job:${promo}:reserve`])
    await db.query(`insert into public.org_promo_draws (debit_key, org_id, user_id, period, drawn) values ($1, $2, $3, to_char(now(), 'YYYY-MM'), $4)`,
      [`job:${promo}:reserve`, orgId, staff, cost])
    const [work] = (await listOrgWorks(rest, orgId, { work: promo })).items
    expect(work).toMatchObject({ id: promo, credits: { orgPaid: 0, orgPromo: cost, personal: 0 } })
  })

  it('filters by member, by status and by work id or its prefix', async () => {
    expect(ids(await listOrgWorks(rest, orgId, { member: other }))).toEqual([running])
    expect(ids(await listOrgWorks(rest, orgId, { status: 'failed' }))).toEqual([failed])
    expect(ids(await listOrgWorks(rest, orgId, { work: ok }))).toEqual([ok])
    expect(ids(await listOrgWorks(rest, orgId, { work: ok.slice(0, 13) }))).toEqual([ok])
    expect(ids(await listOrgWorks(rest, orgId, { work: foreign }))).toEqual([])
    expect(ids(await listOrgWorks(rest, orgId, { work: 'xyz' }))).toEqual([])
  })

  it('still lists a work its maker deleted or lost access to, flagged', async () => {
    await db.query('update public.generation_jobs set deleted_at = now() where id = $1', [ok])
    await removeOrgMember(service, owner, staff, randomUUID())
    const byId = new Map((await listOrgWorks(rest, orgId, {})).items.map((w) => [w.id, w]))
    expect(byId.get(ok)).toMatchObject({ deletedByUser: true, makerLeft: true })
    expect(byId.get(failed)).toMatchObject({ deletedByUser: false, makerLeft: true })
    expect(byId.get(running)).toMatchObject({ makerLeft: false })
  })
})

describe('admin 员工专用链接', () => {
  it("reads the org's own staff link token, the one the owner's workspace shows, and null for no org", async () => {
    expect(await loadOrgInviteToken(rest, orgId)).toBe(await inviteToken(db, orgId))
    expect(await loadOrgInviteToken(rest, randomUUID())).toBeNull()
  })
})
