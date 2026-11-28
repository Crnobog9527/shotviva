import { randomUUID } from 'node:crypto'

import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { reserveJob } from '@/core/jobs'
import { allocateOrgCredits, joinOrg, removeOrgMember } from '@/core/org'
import { archiveOrgWorksOf, DELETED_MAKERS, listCompanyPhotoCategories, listCompanyPhotos, ME, PERSONAL } from '@/core/org/works'

import { createMemoryStore } from '../fakes/memory-store'
import { seedTemplate } from './generation-fixtures'
import { connectAdmin, serviceClient } from './helpers'
import { account, adminAccount, orgWith } from './org-fixtures'
import { serviceSupabase } from './supabase-env'

// Photos' company view by template category (migration 2040). Who reads what is 2037's rule
// (tests/db/org-member-photos.test.ts) and must hold here too: only an active member of an org
// whose workspace is on, the org's works plus their own personal ones, nobody else's personal.

const service = serviceClient()
const rest = serviceSupabase()
let db: Client
let actor: string
let dish: string
let poster: string
let cost: number
const A = `oc-a-${randomUUID().slice(0, 8)}`
const B = `oc-b-${randomUUID().slice(0, 8)}`

beforeAll(async () => {
  db = await connectAdmin()
  actor = await adminAccount(db, service)
  for (const [key, order] of [[A, 9101], [B, 9102]] as const) {
    await db.query('insert into public.template_categories (key, name_en, name_zh, sort_order) values ($1, $2, $3, $4)', [key, `En ${key}`, `中${key.slice(-8)}`, order])
  }
  dish = await seedTemplate(db)
  poster = await seedTemplate(db)
  await db.query('update public.templates set category_key = $2 where id = $1', [dish, A])
  await db.query('update public.templates set category_key = $2 where id = $1', [poster, B])
  cost = (await db.query(`select (credits_cost->>'2k')::int as cost from public.templates where id = $1`, [dish])).rows[0].cost
}, 60_000)

afterAll(async () => {
  await db.end()
})

let tick = 0
// A finished work, each a second later than the last. parent: an edit of that work.
async function made(userId: string, templateId: string, parent: string | null = null) {
  const jobId = randomUUID()
  await reserveJob(rest, { jobId, userId, module: 'image', templateId, source: 'web', parentJobId: parent, inputs: { resolution: '2k', attempt_id: randomUUID() } })
  await db.query('select public.confirm_job($1, $2)', [jobId, `outputs/${userId}/${jobId}.png`])
  await db.query(`update public.generation_jobs set created_at = now() - interval '1 hour' + ($2 || ' seconds')::interval where id = $1`, [jobId, String(++tick)])
  return jobId
}

type Ask = { filter?: string | null; category: string }
const ids = async (user: string, ask: Ask) => (await listCompanyPhotos(rest, user, ask)).works.map((w) => w.id)
const chips = async (user: string, filter: string | null = null) =>
  (await listCompanyPhotoCategories(rest, user, filter)).filter((c) => c.key === A || c.key === B).map((c) => [c.key, c.works])
const setStatus = (orgId: string, status: 'active' | 'suspended') => db.query('update public.orgs set status = $2 where id = $1', [orgId, status])

// An owner and two staff holding org credits. `veteran` and `peer` each made one personal work
// before joining (a dish, a poster). In the org: owner a dish, veteran a poster, peer a dish.
async function company() {
  const { orgId, owner, token } = await orgWith(db, service, actor, { pool: cost * 60 })
  const veteran = await account(db, service, { plan: 'pro_monthly' })
  const before = await made(veteran, dish)
  await joinOrg(service, veteran, token)
  const peer = await account(db, service, { plan: 'pro_monthly' })
  const peerPersonal = await made(peer, poster)
  await joinOrg(service, peer, token)
  for (const who of [owner, veteran, peer]) await allocateOrgCredits(service, owner, who, cost * 8, randomUUID())
  const works = { owner: await made(owner, dish), veteran: await made(veteran, poster), peer: await made(peer, dish) }
  return { orgId, owner, veteran, peer, before, peerPersonal, works }
}

describe('the company view by category', () => {
  it('narrows the company\'s works to one category, the reader\'s personal ones included', async () => {
    const c = await company()
    expect(await ids(c.veteran, { category: A })).toEqual([c.works.peer, c.works.owner, c.before])
    expect(await ids(c.veteran, { category: B })).toEqual([c.works.veteran])
    // The peer's personal poster is the peer's alone: in their view, in nobody else's.
    expect(await ids(c.peer, { category: B })).toEqual([c.works.veteran, c.peerPersonal])
    expect(await ids(c.owner, { category: B })).toEqual([c.works.veteran])
    expect(await chips(c.veteran)).toEqual([[A, 3], [B, 1]])
    expect(await chips(c.peer)).toEqual([[A, 2], [B, 2]])
    // No count query under a category: the chip says how many.
    expect((await listCompanyPhotos(rest, c.veteran, { category: A })).total).toBeNull()
    expect(await ids(c.veteran, { category: 'no-such-category' })).toEqual([])
  })

  it('combines with whose works', async () => {
    const c = await company()
    expect(await ids(c.veteran, { filter: ME, category: B })).toEqual([c.works.veteran])
    expect(await ids(c.veteran, { filter: ME, category: A })).toEqual([])
    expect(await ids(c.veteran, { filter: c.peer, category: A })).toEqual([c.works.peer])
    expect(await ids(c.veteran, { filter: PERSONAL, category: A })).toEqual([c.before])
    // Asking for a colleague by id never reaches that colleague's personal works.
    expect(await ids(c.veteran, { filter: c.peer, category: B })).toEqual([])
    expect(await chips(c.veteran, c.peer)).toEqual([[A, 1]])
    expect(await chips(c.veteran, PERSONAL)).toEqual([[A, 1]])
    expect(await chips(c.veteran, ME)).toEqual([[B, 1]])
  })

  it('counts a colleague\'s edit with the work it was made from', async () => {
    const c = await company()
    const edit = await made(c.peer, 'edit', c.works.peer)
    expect(await ids(c.veteran, { category: A })).toEqual([edit, c.works.peer, c.works.owner, c.before])
    expect(await ids(c.veteran, { category: B })).toEqual([c.works.veteran])
    expect(await chips(c.veteran, c.peer)).toEqual([[A, 2]])
  })

  it('pages from the cursor in both directions', async () => {
    const c = await company()
    const more = [await made(c.owner, dish), await made(c.peer, dish), await made(c.veteran, dish)]
    const newest = [...more.reverse(), c.works.peer, c.works.owner, c.before]
    const call = async (args: Record<string, unknown>) => {
      const { data, error } = await rest.rpc('org_member_photos_in_category', { p_user: c.veteran, p_category: A, ...args })
      if (error) throw new Error(error.message)
      return data as { id: string; created_at: string }[]
    }
    const first = await call({ p_limit: 2 })
    expect(first.map((row) => row.id)).toEqual(newest.slice(0, 2))
    const cursor = first[1]!
    const second = await call({ p_limit: 3, p_before_at: cursor.created_at, p_before_id: cursor.id })
    expect(second.map((row) => row.id)).toEqual(newest.slice(2, 5))
    const up = await call({ p_limit: 1000, p_from_at: cursor.created_at, p_from_id: cursor.id })
    expect(up.map((row) => row.id)).toEqual(newest.slice(0, 2))
    // Load more's list: down to the cursor and one page more, every work once.
    const all = await listCompanyPhotos(rest, c.veteran, { category: A, until: { createdAt: cursor.created_at, id: cursor.id } })
    expect(all.works.map((w) => w.id)).toEqual(newest)
  })
})

describe('who may read it', () => {
  it('gives a stranger nothing, whatever they ask for', async () => {
    const c = await company()
    const stranger = await account(db, service, { plan: 'pro_monthly' })
    await made(stranger, dish)
    expect(await ids(stranger, { category: A })).toEqual([])
    expect(await ids(stranger, { filter: c.peer, category: A })).toEqual([])
    expect(await listCompanyPhotoCategories(rest, stranger)).toEqual([])
    expect(await listCompanyPhotoCategories(rest, stranger, c.peer)).toEqual([])
    const direct = await rest.rpc('org_member_photo_works', { p_user: stranger, p_scope: 'member', p_member: c.peer })
    expect(direct.data).toEqual([])
  })

  it('gives a removed member nothing, and the rest no longer their personal works', async () => {
    const c = await company()
    await removeOrgMember(service, c.owner, c.veteran, randomUUID())
    expect(await ids(c.veteran, { category: A })).toEqual([])
    expect(await ids(c.veteran, { category: B })).toEqual([])
    expect(await listCompanyPhotoCategories(rest, c.veteran)).toEqual([])
    // Their org work stays with the company; their personal one was never in anyone else's view.
    expect(await ids(c.owner, { category: B })).toEqual([c.works.veteran])
    expect(await ids(c.owner, { category: A })).toEqual([c.works.peer, c.works.owner])
  })

  it('gives nothing while the workspace is off, and everything back when it is on again', async () => {
    const c = await company()
    await setStatus(c.orgId, 'suspended')
    expect(await ids(c.veteran, { category: A })).toEqual([])
    expect(await ids(c.owner, { category: A })).toEqual([])
    expect(await listCompanyPhotoCategories(rest, c.owner)).toEqual([])
    await setStatus(c.orgId, 'active')
    expect(await ids(c.veteran, { category: A })).toEqual([c.works.peer, c.works.owner, c.before])
  })

  it('keeps a deleted account\'s works under their category', async () => {
    const c = await company()
    const { store } = createMemoryStore()
    await store.put(`outputs/${c.peer}/${c.works.peer}.png`, new Uint8Array([1]), 'image/png')
    await archiveOrgWorksOf({ db: rest, store }, c.peer)
    await db.query('delete from public.generation_jobs where user_id = $1', [c.peer])
    expect(await ids(c.owner, { category: A })).toEqual([c.works.peer, c.works.owner])
    expect(await ids(c.owner, { filter: DELETED_MAKERS, category: A })).toEqual([c.works.peer])
    expect(await ids(c.owner, { filter: DELETED_MAKERS, category: B })).toEqual([])
  })

  it('is closed to browsers', async () => {
    const fns = [
      'org_member_photo_works(uuid, text, uuid)',
      'org_member_photos_in_category(uuid, text, text, uuid, integer, timestamptz, uuid, timestamptz, uuid)',
      'org_member_photo_categories(uuid, text, uuid)',
    ]
    for (const fn of fns) {
      const { rows } = await db.query(
        `select has_function_privilege('anon', $1, 'execute') as anon, has_function_privilege('authenticated', $1, 'execute') as authed, has_function_privilege('service_role', $1, 'execute') as service`,
        [`public.${fn}`],
      )
      expect(rows[0]).toEqual({ anon: false, authed: false, service: true })
    }
  })
})
