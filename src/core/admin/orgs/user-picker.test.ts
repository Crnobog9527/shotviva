import { beforeEach, describe, expect, it, vi } from 'vitest'

const spies = vi.hoisted(() => ({ list: vi.fn() }))
vi.mock('../users/list', () => ({ listUsers: spies.list }))

const { loadPickerUser, searchPickerUsers } = await import('./user-picker')

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'
const C = '33333333-3333-4333-8333-333333333333'
const D = '44444444-4444-4444-8444-444444444444'
const E = '55555555-5555-4555-8555-555555555555'
const ORG_HERE = '66666666-6666-4666-8666-666666666666'
const ORG_OTHER = '77777777-7777-4777-8777-777777777777'

const row = (id: string, over: Record<string, unknown> = {}) => ({
  id, email: `${id.slice(0, 4)}@example.com`, phone: null, createdAt: '2026-11-01T00:00:00Z', tier: 'free', bannedAt: null, ...over,
})

// A fake service client: each table answers with its rows; filters are ignored on purpose (the
// code under test asks for the right accounts, the rows say who is where).
function fakeDb(tables: Record<string, unknown[]>, auth: { user?: unknown; error?: unknown } = {}, history: { data?: string[]; error?: { message: string } } = {}) {
  const chain = (data: unknown[]) => {
    const q: Record<string, unknown> = { data, error: null }
    for (const m of ['select', 'in', 'eq', 'is']) q[m] = () => q
    q.maybeSingle = () => Promise.resolve({ data: data[0] ?? null, error: null })
    return q
  }
  return {
    from: (table: string) => chain(tables[table] ?? []),
    rpc: (fn: string) => Promise.resolve(fn === 'admin_org_picker_affiliate_history'
      ? { data: history.error ? null : (history.data ?? []), error: history.error ?? null }
      : { data: null, error: { message: `unexpected rpc ${fn}` } }),
    auth: { admin: { getUserById: () => Promise.resolve({ data: { user: auth.user ?? null }, error: auth.error ?? null }) } },
  } as never
}

beforeEach(() => vi.resetAllMocks())

describe('searchPickerUsers', () => {
  it('finds nothing for a query under two characters, without touching the database', async () => {
    expect(await searchPickerUsers(fakeDb({}), ' a ', null)).toEqual([])
    expect(spies.list).not.toHaveBeenCalled()
  })

  it('marks who cannot take the role and why', async () => {
    spies.list.mockResolvedValue({ unavailable: undefined, rows: [row(A), row(B, { bannedAt: 'x' }), row(C), row(D), row(E)] })
    const db = fakeDb({
      org_members: [
        { user_id: C, org_id: ORG_OTHER, role: 'owner' },
        { user_id: D, org_id: ORG_HERE, role: 'member' },
      ],
      orgs: [{ id: ORG_OTHER, name: 'Other Co' }, { id: ORG_HERE, name: 'Here Co' }],
      affiliates: [{ user_id: E }],
    })
    const users = await searchPickerUsers(db, 'exam', ORG_HERE)
    expect(users.map((u) => [u.id, u.status, u.orgName, u.orgRole])).toEqual([
      [A, 'ok', null, null],
      [B, 'banned', null, null],
      [C, 'in_org', 'Other Co', 'owner'],
      [D, 'in_this_org', 'Here Co', 'member'],
      [E, 'personal_affiliate', null, null],
    ])
    // Picking an owner (no org yet): a member of any org is simply "in an org".
    const asOwner = await searchPickerUsers(db, 'exam', null)
    expect(asOwner.find((u) => u.id === D)?.status).toBe('in_org')
  })

  it('marks personal affiliate accounts with history, and marks nobody when that read fails', async () => {
    spies.list.mockResolvedValue({ rows: [row(A), row(E)] })
    const users = await searchPickerUsers(fakeDb({ affiliates: [{ user_id: E }] }, {}, { data: [E] }), 'exam', ORG_HERE)
    expect(users.map((u) => [u.id, u.affiliateHistory])).toEqual([[A, false], [E, true]])
    const failed = await searchPickerUsers(fakeDb({}, {}, { error: { message: 'missing' } }), 'exam', ORG_HERE)
    expect(failed.map((u) => u.affiliateHistory)).toEqual([false, false])
  })

  it('lists at most eight accounts', async () => {
    spies.list.mockResolvedValue({ rows: Array.from({ length: 50 }, (_, i) => row(`00000000-0000-4000-8000-${String(i).padStart(12, '0')}`)) })
    expect(await searchPickerUsers(fakeDb({}), 'exam', null)).toHaveLength(8)
  })

  it('banned wins over every other reason', async () => {
    spies.list.mockResolvedValue({ rows: [row(C, { bannedAt: 'x' })] })
    const db = fakeDb({ org_members: [{ user_id: C, org_id: ORG_OTHER, role: 'member' }], orgs: [{ id: ORG_OTHER, name: 'O' }] })
    expect((await searchPickerUsers(db, 'exam', null))[0]?.status).toBe('banned')
  })
})

describe('loadPickerUser', () => {
  it('ignores an id that is not a uuid', async () => {
    expect(await loadPickerUser(fakeDb({}), 'a@b.co')).toBeNull()
  })
  it('returns null for an unknown account', async () => {
    expect(await loadPickerUser(fakeDb({}, { error: { message: 'x' } }), A)).toBeNull()
    expect(await loadPickerUser(fakeDb({ profiles: [] }, { user: { id: A } }), A)).toBeNull()
  })
  it('describes a known account', async () => {
    const user = { id: A, email: 'a@example.com', phone: '', created_at: '2026-11-01T00:00:00Z' }
    const picked = await loadPickerUser(fakeDb({ profiles: [{ banned_at: null }] }, { user }), A)
    expect(picked).toMatchObject({ id: A, email: 'a@example.com', phone: null, status: 'ok' })
    expect((await loadPickerUser(fakeDb({ profiles: [{ banned_at: 'x' }] }, { user }), A))?.status).toBe('banned')
  })
})
