import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import type { SupabaseClient } from '@supabase/supabase-js'

import { pageReferrers, partnerName, readReferrerDetail, readUserReferrers } from './referrer'

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'
const P1 = '33333333-3333-4333-8333-333333333333'
const P2 = '44444444-4444-4444-8444-444444444444'
const ORG = '55555555-5555-4555-8555-555555555555'

type Tables = Record<string, unknown[]>

// A query builder that records each table read and resolves to that table's rows.
function fakeDb(tables: Tables, users: Record<string, { email?: string; phone?: string }> = {}, failing = false) {
  const reads: string[] = []
  const calls: Record<string, unknown[][]> = {}
  const db = {
    from(table: string) {
      reads.push(table)
      const q: Record<string, unknown> = {}
      for (const m of ['select', 'in', 'not']) q[m] = (...args: unknown[]) => { (calls[`${table}.${m}`] ??= []).push(args); return q }
      q.then = (resolve: (v: unknown) => void) => resolve(failing ? { data: null, error: { message: 'boom' } } : { data: tables[table] ?? [], error: null })
      return q
    },
    auth: { admin: { getUserById: async (id: string) => ({ data: { user: users[id] ? { id, ...users[id] } : null } }) } },
  }
  return { db: db as unknown as SupabaseClient, reads, calls }
}

const binding = (id: string, by: string, extra: Record<string, unknown> = {}) => ({
  id, referred_by: by, referred_at: '2026-11-20T01:00:00Z', referred_source: 'signup', referred_member: null, referred_via: null, ...extra,
})
const partner = (user_id: string, extra: Record<string, unknown> = {}) => ({
  user_id, slug: 'koc-wang', status: 'active', admin_label: null, org_id: null, name: null, ...extra,
})

describe('readUserReferrers', () => {
  it('reads a whole page in three table reads and tags only referred users', async () => {
    const { db, reads, calls } = fakeDb({
      profiles: [binding(A, P1), binding(B, P2, { referred_source: 'org_l1', referred_member: A })],
      affiliates: [partner(P1, { admin_label: '小王（小红书）' }), partner(P2, { slug: 'acme', org_id: ORG })],
      orgs: [{ id: ORG, name: '成都迅手' }],
    })
    const out = await readUserReferrers(db, [A, B, '66666666-6666-4666-8666-666666666666'])
    expect(reads).toEqual(['profiles', 'affiliates', 'orgs'])
    expect(calls['profiles.in']?.[0]).toEqual(['id', [A, B, '66666666-6666-4666-8666-666666666666']])
    expect(calls['profiles.not']?.[0]).toEqual(['referred_by', 'is', null])
    expect(calls['affiliates.select']?.[0]?.[0]).toContain('name:application->>name')
    expect(calls['affiliates.in']?.[0]).toEqual(['user_id', [P1, P2]])
    expect(out.size).toBe(2)
    expect(out.get(A)).toMatchObject({ partnerId: P1, name: '小王（小红书）', slug: 'koc-wang', enterprise: false, source: 'signup' })
    expect(out.get(B)).toMatchObject({ partnerId: P2, name: '成都迅手', enterprise: true, source: 'org_l1', memberId: A })
  })

  it('does not touch the database for an empty page or when nobody was referred', async () => {
    const empty = fakeDb({})
    expect((await readUserReferrers(empty.db, [])).size).toBe(0)
    expect(empty.reads).toEqual([])
    const none = fakeDb({ profiles: [] })
    expect((await readUserReferrers(none.db, [A])).size).toBe(0)
    expect(none.reads).toEqual(['profiles'])
  })

  it('skips a binding whose partner row is gone', async () => {
    const { db } = fakeDb({ profiles: [binding(A, P1)], affiliates: [] })
    expect((await readUserReferrers(db, [A])).size).toBe(0)
  })
})

describe('partnerName', () => {
  it('prefers the admin tag, then the org, then the application name, then the code', () => {
    expect(partnerName({ admin_label: 'tag', name: 'n', slug: 's' }, 'org')).toBe('tag')
    expect(partnerName({ admin_label: null, name: 'n', slug: 's' }, 'org')).toBe('org')
    expect(partnerName({ admin_label: null, name: ' n ', slug: 's' }, null)).toBe('n')
    expect(partnerName({ admin_label: null, name: '  ', slug: 's' }, null)).toBe('s')
  })
})

describe('readReferrerDetail', () => {
  it('adds the partner, member and via contacts from Auth', async () => {
    const { db } = fakeDb(
      { profiles: [binding(A, P1, { referred_source: 'org_l2', referred_member: B, referred_via: P2 })], affiliates: [partner(P1)] },
      { [P1]: { email: 'partner@example.com' }, [B]: { phone: '8613000000001' }, [P2]: { email: 'via@example.com' } },
    )
    const out = await readReferrerDetail(db, A)
    expect(out).toMatchObject({ partnerContact: 'partner@example.com', memberContact: '+86 130 0000 0001', viaContact: 'via@example.com' })
  })

  it('is null for an account nobody referred', async () => {
    const { db } = fakeDb({ profiles: [] })
    expect(await readReferrerDetail(db, A)).toBeNull()
  })
})

describe('read failures', () => {
  it('leave the list and the detail without a referrer instead of throwing', async () => {
    const { db } = fakeDb({}, {}, true)
    expect((await pageReferrers(db, [A])).size).toBe(0)
    expect(await readReferrerDetail(db, A)).toBeNull()
  })
})
