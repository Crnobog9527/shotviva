import { randomUUID } from 'node:crypto'

import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { batchAdjustCredits, batchSetBanned, listUsers, type UserFilters } from '@/core/admin'

import { connectAdmin, createUser, DAY_MS, ledgerOf, profileOf } from './helpers'
import { anonSupabase, serviceSupabase } from './supabase-env'

// T77 /admin/users as a list (ARCHITECTURE §10.a): admin_list_users (0620) filters, sorts, pages
// and counts; admin_batch_adjust_credits (0621) and admin_batch_set_banned (0622) are one
// transaction each, all or nothing, idempotent per batch. Every user here has an email with this
// run's token, so the query isolates them from other test files sharing the database.

const service = serviceSupabase()
const token = `t77-${randomUUID().slice(0, 8)}`
let db: Client

// A user named <token>-<name>@example.test, signed up `daysAgo` days ago.
async function namedUser(name: string, daysAgo: number, profile: Parameters<typeof createUser>[1] = {}) {
  const id = await createUser(db, profile)
  await db.query('update auth.users set email = $2 where id = $1', [id, `${token}-${name}@example.test`])
  await db.query('update public.profiles set created_at = $2 where id = $1', [id, new Date(Date.now() - daysAgo * DAY_MS)])
  return id
}

// A membership bought the way checkout settles it: a paid-pool purchase row naming the product.
async function buy(id: string, productId: string, paidDays: number) {
  await db.query("select public._apply_credit_change($1, 'paid', 'purchase', 10, 'test purchase', $2, null, $3, $4)", [id, `t77:${randomUUID()}`, productId, paidDays])
}

const list = (filters: UserFilters = {}) => listUsers(service, { q: token, ...filters })
const ids = async (filters: UserFilters = {}) => (await list(filters)).rows.map((row) => row.id)

const users: Record<string, string> = {}
// The admin running the batches (the server action passes requireAdmin()'s id).
let actor: string

const reasonsOf = async (id: string, table: 'credit_ledger' | 'admin_audit_log') =>
  (await db.query<{ reason: string }>(`select reason from public.${table} where user_id = $1 order by id`, [id])).rows.map((row) => row.reason)

beforeAll(async () => {
  db = await connectAdmin()
  actor = await createUser(db)
  await db.query("update public.profiles set role = 'admin' where id = $1", [actor])
  users.max = await namedUser('max', 1, { credits: 3 })
  users.lapsed = await namedUser('lapsed', 2, { credits: 40 })
  users.google = await namedUser('google', 3, { freeCredits: 1 })
  users.banned = await namedUser('banned', 4)
  await buy(users.max, 'max_yearly', 365)
  await buy(users.lapsed, 'pro_monthly', 30)
  await db.query("update public.profiles set paid_until = now() - interval '1 day' where id = $1", [users.lapsed])
  await db.query(`update auth.users set raw_app_meta_data = '{"provider":"google","providers":["google"]}' where id = $1`, [users.google])
  await db.query('update public.profiles set banned_at = now() where id = $1', [users.banned])
  await db.query(
    `insert into public.generation_jobs
       (id, user_id, module, template_id, inputs, provider, source, status, visibility, credits_cost, credit_pool, output_key, finished_at)
     values ($1, $2, 'image', 'freeform', '{}', 'openai/gpt-image-2', 'web', 'succeeded', 'public', 2, 'free', 'outputs/x.png', now())`,
    [randomUUID(), users.banned],
  )
})

afterAll(async () => {
  await db.end()
})

describe('admin_list_users', () => {
  it('lists newest sign-ups first with the total, the tier and its interval', async () => {
    const page = await list()
    expect(page.total).toBe(4)
    expect(page.rows.map((row) => row.id)).toEqual([users.max, users.lapsed, users.google, users.banned])
    expect(page.rows[0]).toMatchObject({ tier: 'max', interval: 'year', credits: 13, email: `${token}-max@example.test` })
    // A membership that ran out is free again, whatever was bought before.
    expect(page.rows[1]).toMatchObject({ tier: 'free', interval: null })
  })

  it('filters by tier, sign-up method, status and sign-up dates', async () => {
    expect(await ids({ tier: 'max' })).toEqual([users.max])
    expect(await ids({ tier: 'pro' })).toEqual([])
    expect(await ids({ tier: 'free' })).toEqual([users.lapsed, users.google, users.banned])
    expect(await ids({ provider: 'google' })).toEqual([users.google])
    expect(await ids({ status: 'banned' })).toEqual([users.banned])
    expect(await ids({ status: 'active' })).not.toContain(users.banned)
    const day = (daysAgo: number) => new Date(Date.now() - daysAgo * DAY_MS + 8 * 3600_000).toISOString().slice(0, 10)
    expect(await ids({ from: day(3), to: day(2) })).toEqual([users.lapsed, users.google])
  })

  it('sorts by paid credits and by the last generation', async () => {
    expect((await ids({ sort: 'paid_credits' })).slice(0, 2)).toEqual([users.lapsed, users.max])
    expect((await ids({ sort: 'last_job' }))[0]).toBe(users.banned)
    expect((await list({ status: 'banned' })).rows[0]?.lastGenerationAt).not.toBeNull()
  })

  it('pages by 50 with numbered pages', async () => {
    const pageToken = `${token}-p`
    for (let i = 0; i < 52; i++) await namedUser(`p${String(i).padStart(2, '0')}`, 10 + i)
    const first = await listUsers(service, { q: pageToken })
    expect(first).toMatchObject({ total: 52, page: 1, pageCount: 2 })
    expect(first.rows).toHaveLength(50)
    const second = await listUsers(service, { q: pageToken, page: 2 })
    expect(second.rows.map((row) => row.email)).toEqual([`${pageToken}50@example.test`, `${pageToken}51@example.test`])
    expect((await listUsers(service, { q: pageToken, page: 3 })).rows).toEqual([])
  })

  it('is not callable by anon or a signed-in user', async () => {
    const { error } = await anonSupabase().rpc('admin_list_users', {})
    expect(error?.message).toMatch(/permission denied/)
  })
})

describe('admin_batch_adjust_credits', () => {
  it('writes one ledger row per user, once per batch however often it is sent', async () => {
    const three = [await createUser(db), await createUser(db), await createUser(db)]
    const input = { userIds: three, pool: 'paid', amount: 5, reason: 'launch gift', batchKey: randomUUID() }
    expect(await batchAdjustCredits(service, actor, input)).toEqual({ kind: 'done', changed: 3, unchanged: 0 })
    expect(await batchAdjustCredits(service, actor, input)).toEqual({ kind: 'done', changed: 0, unchanged: 3 })
    for (const id of three) {
      expect((await profileOf(db, id)).credits).toBe(5)
      expect((await ledgerOf(db, id)).filter((row) => row.kind === 'admin_adjust')).toEqual([
        { kind: 'admin_adjust', pool: 'paid', delta: 5, idempotency_key: `admin_batch:${input.batchKey}:${id}` },
      ])
    }
    await expect(batchAdjustCredits(service, actor, { ...input, amount: 6 })).rejects.toMatchObject({ code: 'CONFLICT' })
    expect(await reasonsOf(three[0]!, 'credit_ledger')).toEqual([`launch gift · 操作人 ${actor}`])
  })

  it('refuses an actor who is not an admin', async () => {
    const someone = await createUser(db)
    const target = await createUser(db)
    const input = { userIds: [target], pool: 'paid', amount: 1, reason: 'x', batchKey: randomUUID() }
    await expect(batchAdjustCredits(service, someone, input)).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect(await ledgerOf(db, target)).toEqual([])
  })

  it('changes nobody and names who blocked it when one pool would go below zero', async () => {
    const rich = await createUser(db, { freeCredits: 5 })
    const poor = await createUser(db, { freeCredits: 1 })
    const outcome = await batchAdjustCredits(service, actor, { userIds: [rich, poor], pool: 'free', amount: -2, reason: 'abuse', batchKey: randomUUID() })
    expect(outcome).toEqual({ kind: 'rejected', reason: 'insufficient', userIds: [poor] })
    expect((await profileOf(db, rich)).free_credits).toBe(5)
    expect(await ledgerOf(db, rich)).toEqual([])
  })

  it('changes nobody when an account is gone', async () => {
    const here = await createUser(db)
    const gone = randomUUID()
    const outcome = await batchAdjustCredits(service, actor, { userIds: [here, gone], pool: 'paid', amount: 1, reason: 'x', batchKey: randomUUID() })
    expect(outcome).toEqual({ kind: 'rejected', reason: 'missing', userIds: [gone] })
    expect(await ledgerOf(db, here)).toEqual([])
  })

  it('refuses more than 50 users, a repeated user and a missing reason', async () => {
    const base = { pool: 'paid', amount: 1, reason: 'x', batchKey: randomUUID() }
    const many = Array.from({ length: 51 }, () => randomUUID())
    await expect(batchAdjustCredits(service, actor, { ...base, userIds: many })).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    const one = await createUser(db)
    await expect(batchAdjustCredits(service, actor, { ...base, userIds: [one, one] })).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    await expect(batchAdjustCredits(service, actor, { ...base, userIds: [one], reason: ' ' })).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    const { error } = await service.rpc('admin_batch_adjust_credits', { p_actor: actor, p_user_ids: many, p_pool: 'paid', p_amount: 1, p_reason: 'x', p_batch_key: 'k' })
    expect(error?.message).toBe('INVALID_INPUT')
  })

  it('is not callable by anon', async () => {
    const { error } = await anonSupabase().rpc('admin_batch_adjust_credits', { p_actor: randomUUID(), p_user_ids: [randomUUID()], p_pool: 'paid', p_amount: 1, p_reason: 'x', p_batch_key: 'k' })
    expect(error?.message).toMatch(/permission denied/)
  })
})

describe('admin_batch_set_banned', () => {
  const auditOf = async (id: string) => (await db.query<{ action: string }>('select action from public.admin_audit_log where user_id = $1 order by id', [id])).rows.map((row) => row.action)

  it('bans the users not banned yet, one audit row each, and repeating changes nobody', async () => {
    const fresh = [await createUser(db), await createUser(db)]
    const already = await createUser(db)
    await db.query("update public.profiles set banned_at = now() - interval '1 day' where id = $1", [already])
    const before = (await profileOf(db, already)).banned_at
    const input = { userIds: [...fresh, already], banned: true, reason: 'spam ring' }
    expect(await batchSetBanned(service, actor, input)).toEqual({ kind: 'done', changed: 2, unchanged: 1 })
    expect(await batchSetBanned(service, actor, input)).toEqual({ kind: 'done', changed: 0, unchanged: 3 })
    for (const id of fresh) {
      expect((await profileOf(db, id)).banned_at).toBeInstanceOf(Date)
      expect(await auditOf(id)).toEqual(['ban_user'])
    }
    expect((await profileOf(db, already)).banned_at).toEqual(before)
    expect(await auditOf(already)).toEqual([])
    expect(await batchSetBanned(service, actor, { ...input, banned: false, reason: 'appeal' })).toEqual({ kind: 'done', changed: 3, unchanged: 0 })
    expect(await auditOf(fresh[0]!)).toEqual(['ban_user', 'unban_user'])
    expect(await reasonsOf(fresh[0]!, 'admin_audit_log')).toEqual([`spam ring · 操作人 ${actor}`, `appeal · 操作人 ${actor}`])
  })

  it('never bans an admin or the acting admin, and then bans nobody', async () => {
    const plain = await createUser(db)
    const otherAdmin = await createUser(db)
    await db.query("update public.profiles set role = 'admin' where id = $1", [otherAdmin])
    const outcome = await batchSetBanned(service, actor, { userIds: [plain, otherAdmin, actor], banned: true, reason: 'x' })
    expect(outcome).toEqual({ kind: 'rejected', reason: 'protected', userIds: [otherAdmin, actor].sort() })
    expect((await profileOf(db, plain)).banned_at).toBeNull()
    expect((await profileOf(db, otherAdmin)).banned_at).toBeNull()
    await expect(batchSetBanned(service, plain, { userIds: [otherAdmin], banned: true, reason: 'x' })).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('changes nobody when an account is gone', async () => {
    const here = await createUser(db)
    const gone = randomUUID()
    expect(await batchSetBanned(service, actor, { userIds: [here, gone], banned: true, reason: 'x' })).toEqual({ kind: 'rejected', reason: 'missing', userIds: [gone] })
    expect((await profileOf(db, here)).banned_at).toBeNull()
  })

  it('is not callable by anon', async () => {
    const { error } = await anonSupabase().rpc('admin_batch_set_banned', { p_actor: randomUUID(), p_user_ids: [randomUUID()], p_banned: true, p_reason: 'x' })
    expect(error?.message).toMatch(/permission denied/)
  })
})
