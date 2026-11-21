import { describe, expect, it } from 'vitest'

import { monthStart, readInviteOrg, readOrgView, readPaymentAccounts, readSeatOrgId } from './reads'

const ORG = '11111111-1111-4111-8111-111111111111'
const OWNER = '00000000-0000-4000-8000-0000000000a1'
const STAFF = '00000000-0000-4000-8000-0000000000b2'
const OTHER = '00000000-0000-4000-8000-0000000000c3'

type Rows = Record<string, unknown>
// A PostgREST stand-in: every filter is ignored, each table answers with the rows it was given
// (fake data). `calls` records which tables and filters were asked for.
function fakeDb(tables: Rows, rpc: Record<string, unknown> = {}) {
  const calls: string[] = []
  const users: Record<string, { email?: string; phone?: string }> = {
    [OWNER]: { email: 'owner@acme.test' }, [STAFF]: { phone: '+8613800001111' }, [OTHER]: { email: 'ann@acme.test' },
  }
  const from = (table: string) => {
    const rows = tables[table]
    const done = (single: boolean) => Promise.resolve({
      data: single ? (Array.isArray(rows) ? rows[0] ?? null : rows ?? null) : rows ?? [],
      error: null,
      count: Array.isArray(rows) ? rows.length : null,
    })
    const chain: Record<string, unknown> = {}
    for (const name of ['select', 'eq', 'in', 'gte', 'order', 'limit']) chain[name] = (...args: unknown[]) => { calls.push(`${table}.${name}(${args.map(String).join(',')})`); return chain }
    chain.maybeSingle = () => done(true)
    chain.then = (resolve: (value: unknown) => unknown) => done(false).then(resolve)
    return chain
  }
  const auth = { admin: { getUserById: async (id: string) => ({ data: { user: users[id] ?? null } }) } }
  const rpcFn = async (fn: string, args: Record<string, unknown>) => {
    calls.push(`rpc.${fn}(${JSON.stringify(args)})`)
    return fn in rpc ? { data: rpc[fn], error: null } : { data: null, error: { message: 'boom' } }
  }
  return { db: { from, auth, rpc: rpcFn } as never, calls }
}

const org = { id: ORG, name: 'Acme Studio', owner_user_id: OWNER, status: 'active', pool_credits: 1200, invite_token: 'a'.repeat(32), affiliate_enabled: true, affiliate_levels: 1 }

describe('readOrgView', () => {
  it('is none for an account in no org', async () => {
    const { db } = fakeDb({ org_members: null })
    expect(await readOrgView(OTHER, { db })).toEqual({ kind: 'none' })
  })

  it("gives the owner their org, members with customer counts, and what they may deposit", async () => {
    const { db } = fakeDb({
      org_members: [
        { user_id: OWNER, role: 'owner', monthly_allowance: 0, held_credits: 30, joined_at: '2026-11-01T00:00:00Z', org_id: ORG },
        { user_id: STAFF, role: 'member', monthly_allowance: 500, held_credits: 120, joined_at: '2026-11-02T00:00:00Z', org_id: ORG },
      ],
      orgs: org,
      org_packages: [{ id: ORG, name: 'Starter', price_usd_cents: 123400, credits: 98765 }],
      profiles: [{ credits: 100 }],
    }, { org_customer_counts: [{ member_user_id: STAFF, l1_customers: 2, l2_customers: 0 }] })
    const view = await readOrgView(OWNER, { db, maskPhone: (phone) => phone.slice(0, 3) + '****' })
    expect(view.kind).toBe('owner')
    if (view.kind !== 'owner') return
    expect(view.org).toMatchObject({ name: 'Acme Studio', poolCredits: 1200, status: 'active' })
    expect(view.inviteToken).toBe('a'.repeat(32))
    expect(view.members.map((m) => [m.account, m.customers])).toEqual([['owner@acme.test', 0], ['+86****', 2]])
    expect(view.packages).toEqual([{ id: ORG, name: 'Starter', priceUsdCents: 123400, credits: 98765 }])
    // credits 100 minus min(held 30, 100): the org's share is not the owner's to deposit.
    expect(view.depositable).toBe(70)
  })

  it('never lets a deposit exceed the owner\'s own credits when the held share is larger', async () => {
    const { db } = fakeDb({
      org_members: [{ user_id: OWNER, role: 'owner', monthly_allowance: 0, held_credits: 900, joined_at: '2026-11-01T00:00:00Z', org_id: ORG }],
      orgs: org, org_packages: [], profiles: [{ credits: 100 }],
    }, { org_customer_counts: [] })
    const view = await readOrgView(OWNER, { db })
    expect(view.kind === 'owner' && view.depositable).toBe(0)
  })

})

describe('readOrgView for a member', () => {
  it("gives a member only their own card: this month's allocations, what is left, their customers and spend", async () => {
    const statsRow = {
      member_user_id: STAFF, member_role: 'member', member_status: 'active', allocated: 600, used: 40,
      l1_signups: 2, l1_paying: 1, l1_paid_cents: 4900, l2_signups: 0, l2_paying: 0, l2_paid_cents: 0,
    }
    const { db, calls } = fakeDb({
      org_members: { org_id: ORG, role: 'member', monthly_allowance: 500, held_credits: 80 },
      orgs: org,
      org_credit_ledger: [{ delta: -500 }, { delta: -100 }],
    }, { org_member_stats: [statsRow], org_customer_counts: [{ member_user_id: STAFF, l1_customers: 1, l2_customers: 0 }] })
    const now = new Date('2026-11-21T10:00:00Z')
    const view = await readOrgView(STAFF, { db, now })
    expect(view).toEqual({
      kind: 'member', orgName: 'Acme Studio', status: 'active', monthlyAllowance: 500, allocatedThisMonth: 600, heldCredits: 80, customers: 1,
      withLevel2: false, period: '2026-11',
      performance: { l1: { customers: 1, signups: 2, paying: 1, paidCents: 4900 }, l2: { customers: 0, signups: 0, paying: 0, paidCents: 0 } },
    })
    expect(calls).toContain(`org_credit_ledger.gte(created_at,${monthStart(now)})`)
    // The staff variant is asked for the caller's own id: the function returns only their row.
    expect(calls).toContain(`rpc.org_customer_counts(${JSON.stringify({ p_caller: STAFF, p_org_id: ORG })})`)
    expect(calls).toContain(`rpc.org_member_stats(${JSON.stringify({ p_caller: STAFF, p_org_id: ORG, p_period: '2026-11' })})`)
    // A member's read never lists the org's members or its invite token.
    expect(JSON.stringify(view)).not.toContain('a'.repeat(32))
    expect(calls.some((c) => c.startsWith('org_packages'))).toBe(false)
  })

  it('still shows the card when the spend numbers cannot be read, and level 2 only when the org has it', async () => {
    const { db } = fakeDb({
      org_members: { org_id: ORG, role: 'member', monthly_allowance: 500, held_credits: 80 },
      orgs: { ...org, affiliate_levels: 2 },
      org_credit_ledger: [],
    }, { org_customer_counts: [{ member_user_id: STAFF, l1_customers: 1, l2_customers: 0 }] })
    const view = await readOrgView(STAFF, { db, now: new Date('2026-11-21T10:00:00Z') })
    expect(view).toMatchObject({ kind: 'member', withLevel2: true, performance: null, customers: 1 })
  })
})

describe('invite reads', () => {
  it('a malformed token is no org, without a query', async () => {
    const { db, calls } = fakeDb({ orgs: org })
    expect(await readInviteOrg(db, 'nope')).toBeNull()
    expect(await readInviteOrg(db, "' or 1=1 --")).toBeNull()
    expect(calls).toEqual([])
  })
  it('finds an org by its token and reports the seat of an account', async () => {
    const { db } = fakeDb({ orgs: { id: ORG, name: 'Acme Studio', status: 'suspended' }, org_members: { org_id: ORG } })
    expect(await readInviteOrg(db, 'a'.repeat(32))).toEqual({ id: ORG, name: 'Acme Studio', status: 'suspended' })
    expect(await readSeatOrgId(db, STAFF)).toBe(ORG)
  })
})

describe('monthStart', () => {
  it('is the first of the UTC month', () => {
    expect(monthStart(new Date('2026-12-31T23:59:59Z'))).toBe('2026-12-01T00:00:00.000Z')
  })
})

describe('readPaymentAccounts', () => {
  it('maps the enabled groups, and answers null (not a crash) when the read fails', async () => {
    const rows = [{ kind: 'overseas_us', details: { account_name: 'Sample Holdings' }, updated_at: '2026-01-01T00:00:00Z' }]
    const ok = { rpc: async (fn: string, args: Record<string, unknown>) => ({ data: fn === 'org_payment_accounts_for_owner' && args.p_owner === OWNER ? rows : null, error: null }) }
    expect(await readPaymentAccounts(ok as never, OWNER)).toEqual([{ kind: 'overseas_us', details: { account_name: 'Sample Holdings' } }])
    const broken = { rpc: async () => ({ data: null, error: { message: 'NOT_ORG_OWNER' } }) }
    expect(await readPaymentAccounts(broken as never, OWNER)).toBeNull()
  })
})
