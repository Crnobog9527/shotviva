import { describe, expect, it } from 'vitest'

import { buildOrgReport, type ReportLabels } from './report-export'

const ORG = '11111111-1111-4111-8111-111111111111'
const OWNER = '00000000-0000-4000-8000-0000000000a1'
const STAFF = '00000000-0000-4000-8000-0000000000b2'

const labels: ReportLabels = {
  members: { member: 'Member', role: 'Role', status: 'Status', allocated: 'Given', used: 'Used', l1Signups: 'S1', l1Paying: 'P1', l1Paid: 'U1', l2Signups: 'S2', l2Paying: 'P2', l2Paid: 'U2' },
  customers: { member: 'Member', level: 'Level', contact: 'Customer', signedUp: 'Signed up', paidInPeriod: 'Month', paidTotal: 'Total' },
  total: 'Total', owner: 'Main admin', staff: 'Member', active: 'Active', removed: 'Left', unknown: 'Account',
}

function fake(org: unknown, rpc: Record<string, unknown>) {
  const rpcCalls: string[] = []
  const chain: Record<string, unknown> = {}
  chain.select = () => chain
  chain.eq = () => chain
  chain.maybeSingle = () => Promise.resolve({ data: org, error: null })
  const users: Record<string, { email: string }> = { [OWNER]: { email: 'owner@acme.test' }, [STAFF]: { email: '=cmd|"x"@acme.test' } }
  const db = {
    from: () => chain,
    auth: { admin: { getUserById: async (id: string) => ({ data: { user: users[id] ?? null } }) } },
    rpc: async (fn: string) => { rpcCalls.push(fn); return { data: rpc[fn] ?? [], error: null } },
  }
  return { db: db as never, rpcCalls }
}

const stats = (id: string, role: string, status = 'active', over: Record<string, unknown> = {}) => ({
  member_user_id: id, member_role: role, member_status: status, allocated: 100, used: 10,
  l1_signups: 1, l1_paying: 1, l1_paid_cents: 2500, l2_signups: 0, l2_paying: 0, l2_paid_cents: 0, ...over,
})
const run = (db: never, kind: 'members' | 'customers' = 'members') => buildOrgReport({ db, user: OWNER, period: '2026-11', kind, labels, maskPhone: (p) => p })

describe('buildOrgReport', () => {
  it('is NOT_FOUND for an account that owns no org, before any report function is called', async () => {
    const { db, rpcCalls } = fake(null, {})
    await expect(run(db)).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(rpcCalls).toEqual([])
  })

  it('writes the member table named for the month, escaping a hostile account name', async () => {
    const { db, rpcCalls } = fake(
      { id: ORG, affiliate_enabled: true, affiliate_levels: 1 },
      { org_member_stats: [stats(OWNER, 'owner'), stats(STAFF, 'member', 'removed')] },
    )
    const { filename, body } = await run(db)
    expect(filename).toBe('performance-2026-11.csv')
    expect(rpcCalls).toEqual(['org_member_stats'])
    const lines = body.replace(/^﻿/, '').split('\r\n').filter(Boolean)
    expect(lines[1]).toBe('"owner@acme.test","Main admin","Active","100","10","1","1","25.00"')
    expect(lines[2]).toBe(`"'=cmd|""x""@acme.test","Member","Left","100","10","1","1","25.00"`)
    expect(lines[3]).toBe('"Total","","","200","20","2","2","50.00"')
  })

  it('adds the level-2 columns only for an org with level 2 on', async () => {
    const { db } = fake({ id: ORG, affiliate_enabled: true, affiliate_levels: 2 }, { org_member_stats: [stats(OWNER, 'owner')] })
    expect((await run(db)).body).toContain('"S2"')
  })

  it('asks for the customers only when the customer file is wanted, and keeps them masked', async () => {
    const { db, rpcCalls } = fake(
      { id: ORG, affiliate_enabled: true, affiliate_levels: 1 },
      {
        org_member_stats: [stats(OWNER, 'owner')],
        org_member_customers: [{ member_user_id: OWNER, level: 1, contact: 'j***@example.com', signed_up_at: '2026-11-03T08:00:00Z', paid_in_period_cents: 2500, paid_total_cents: 5000 }],
      },
    )
    const { filename, body } = await run(db, 'customers')
    expect(filename).toBe('customers-2026-11.csv')
    expect(rpcCalls).toContain('org_member_customers')
    expect(body).toContain('"owner@acme.test","1","j***@example.com","2026-11-03T08:00:00Z","25.00","50.00"')
    expect(body).not.toMatch(/"[^"*,]+@example\.com"/) // never an unmasked customer address
  })
})
