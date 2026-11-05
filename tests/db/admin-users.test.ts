import { randomUUID } from 'node:crypto'

import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { adjustUserCredits, banUser, ledgerPage, loadUser, searchUsers, unbanUser } from '@/core/admin'

import { connectAdmin, createUser, ledgerOf, profileOf } from './helpers'
import { serviceSupabase } from './supabase-env'

// T23 /admin/users: search through admin_search_users, and the three writes. Adjusting writes
// the ledger; ban and unban write admin_audit_log (ARCHITECTURE §10 「审计」).

let db: Client
let user: string
let email: string
const service = serviceSupabase()

const auditOf = async (id: string) =>
  (await db.query<{ action: string; reason: string }>('select action, reason from public.admin_audit_log where user_id = $1 order by id', [id])).rows

beforeAll(async () => {
  db = await connectAdmin()
  user = await createUser(db, { credits: 5, freeCredits: 2 })
  email = (await db.query<{ email: string }>('select email from auth.users where id = $1', [user])).rows[0]!.email
})

afterAll(async () => {
  await db.end()
})

describe('admin_search_users', () => {
  it('finds by email substring, case-insensitively, at most 50 rows', async () => {
    const rows = await searchUsers(service, email.slice(3, 20).toUpperCase())
    expect(rows.map((row) => row.id)).toEqual([user])
    expect(rows[0]).toMatchObject({ email, credits: 5, freeCredits: 2, role: 'user', bannedAt: null })
    expect((await searchUsers(service, 'example.test')).length).toBeLessThanOrEqual(50)
  })

  it('treats % and _ literally and ignores a blank query', async () => {
    expect(await searchUsers(service, '%')).toEqual([])
    expect(await searchUsers(service, '   ')).toEqual([])
  })

  it('is not callable by anon', async () => {
    const { anonSupabase } = await import('./supabase-env')
    const { error } = await anonSupabase().rpc('admin_search_users', { p_query: 'a' })
    expect(error?.message).toMatch(/permission denied/)
  })
})

describe('adjust credits', () => {
  it('writes one ledger row with the reason, idempotent per dialog key', async () => {
    const key = randomUUID()
    const input = { userId: user, pool: 'paid', amount: 3, reason: 'support: failed render', idempotencyKey: key }
    await adjustUserCredits(service, input)
    await adjustUserCredits(service, input)
    expect((await profileOf(db, user)).credits).toBe(8)
    const rows = (await ledgerOf(db, user)).filter((row) => row.kind === 'admin_adjust')
    expect(rows).toEqual([{ kind: 'admin_adjust', pool: 'paid', delta: 3, idempotency_key: `admin:${key}` }])
    const page = await ledgerPage(service, user)
    expect(page.items[0]).toMatchObject({ kind: 'admin_adjust', delta: 3, reason: 'support: failed render' })
  })

  it('refuses taking a pool below zero and a missing reason', async () => {
    await expect(
      adjustUserCredits(service, { userId: user, pool: 'free', amount: -100, reason: 'x', idempotencyKey: randomUUID() }),
    ).rejects.toMatchObject({ code: 'CREDITS_INSUFFICIENT' })
    await expect(
      adjustUserCredits(service, { userId: user, pool: 'free', amount: 1, reason: ' ', idempotencyKey: randomUUID() }),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' })
  })
})

describe('ban and unban', () => {
  it('both write the audit log with their reason and flip banned_at', async () => {
    await banUser(service, { userId: user, reason: 'abuse' })
    expect((await profileOf(db, user)).banned_at).toBeInstanceOf(Date)
    expect((await loadUser(service, user))?.bannedAt).not.toBeNull()
    await unbanUser(service, { userId: user, reason: 'appeal accepted' })
    expect((await profileOf(db, user)).banned_at).toBeNull()
    expect(await auditOf(user)).toEqual([
      { action: 'ban_user', reason: 'abuse' },
      { action: 'unban_user', reason: 'appeal accepted' },
    ])
  })

  it('requires a reason and an existing user', async () => {
    await expect(unbanUser(service, { userId: user, reason: '' })).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    await expect(unbanUser(service, { userId: randomUUID(), reason: 'x' })).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
})

describe('ledger paging', () => {
  it('walks newest first with a cursor and no overlap', async () => {
    const pageUser = await createUser(db)
    for (let i = 0; i < 32; i++) {
      await adjustUserCredits(service, { userId: pageUser, pool: 'free', amount: 1, reason: `r${i}`, idempotencyKey: randomUUID() })
    }
    const first = await ledgerPage(service, pageUser)
    expect(first.items).toHaveLength(30)
    expect(first.nextCursor).not.toBeNull()
    const second = await ledgerPage(service, pageUser, first.nextCursor)
    expect(second.items).toHaveLength(2)
    expect(second.nextCursor).toBeNull()
    const ids = [...first.items, ...second.items].map((row) => row.id)
    expect(new Set(ids).size).toBe(32)
  })
})
