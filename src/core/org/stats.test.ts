import { describe, expect, it } from 'vitest'

import { canGoBack, currentPeriod, readMemberStats, readOrgCustomers, resolvePeriod, shiftPeriod, sumStats } from './stats'

const ORG = '11111111-1111-4111-8111-111111111111'
const OWNER = '00000000-0000-4000-8000-0000000000a1'
const STAFF = '00000000-0000-4000-8000-0000000000b2'
const NOW = new Date('2026-11-21T10:00:00Z')

describe('periods', () => {
  it('uses the UTC month, even just before the month turns over elsewhere', () => {
    expect(currentPeriod(new Date('2026-11-30T23:59:59Z'))).toBe('2026-11')
    expect(currentPeriod(new Date('2026-12-01T00:00:00Z'))).toBe('2026-12')
  })
  it('takes a valid past or current month and falls back to the current one otherwise', () => {
    expect(resolvePeriod('2026-10', NOW)).toBe('2026-10')
    expect(resolvePeriod('2026-11', NOW)).toBe('2026-11')
    for (const bad of ['2026-12', '2027-01', '2026-13', '2026-00', '2026-1', 'x', '', "2026-11' or 1=1", '2019-12', null, undefined]) {
      expect(resolvePeriod(bad, NOW)).toBe('2026-11')
    }
  })
  it('steps across a year boundary and stops at the earliest month', () => {
    expect(shiftPeriod('2026-01', -1)).toBe('2025-12')
    expect(shiftPeriod('2025-12', 1)).toBe('2026-01')
    expect(canGoBack('2025-01')).toBe(false)
    expect(canGoBack('2025-02')).toBe(true)
  })
})

const wire = (over: Record<string, unknown> = {}) => ({
  member_user_id: STAFF, member_role: 'member', member_status: 'active', allocated: 500, used: 20,
  l1_signups: 2, l1_paying: 1, l1_paid_cents: 4900, l2_signups: 1, l2_paying: 1, l2_paid_cents: 1000, ...over,
})

describe('readMemberStats', () => {
  it('passes the session account, the org and the month, and maps the rows', async () => {
    const calls: unknown[] = []
    const client = { rpc: async (fn: string, args: Record<string, unknown>) => { calls.push([fn, args]); return { data: [wire()], error: null } } }
    const rows = await readMemberStats(client, OWNER, ORG, '2026-11')
    expect(calls).toEqual([['org_member_stats', { p_caller: OWNER, p_org_id: ORG, p_period: '2026-11' }]])
    expect(rows).toEqual([{
      userId: STAFF, role: 'member', status: 'active', allocated: 500, used: 20,
      l1: { signups: 2, paying: 1, paidCents: 4900 }, l2: { signups: 1, paying: 1, paidCents: 1000 },
    }])
  })
  it('refuses a malformed month before calling, and turns the outsider error into FORBIDDEN', async () => {
    const client = { rpc: async () => ({ data: null, error: { message: 'NOT_ORG_MEMBER' } }) }
    await expect(readMemberStats(client, OWNER, ORG, '2026-1')).rejects.toThrow()
    await expect(readMemberStats(client, OWNER, ORG, '2026-11')).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })
  it('rejects a row of an unexpected shape instead of showing it', async () => {
    const client = { rpc: async () => ({ data: [wire({ l1_paid_cents: 'a lot' })], error: null }) }
    await expect(readMemberStats(client, OWNER, ORG, '2026-11')).rejects.toMatchObject({ code: 'INTERNAL' })
  })
})

describe('readOrgCustomers and sumStats', () => {
  it('maps customers as the function returns them (already masked)', async () => {
    const client = { rpc: async () => ({ data: [{ member_user_id: STAFF, level: 2, contact: 'j***@example.com', signed_up_at: '2026-11-03T08:00:00Z', paid_in_period_cents: 100, paid_total_cents: 300 }], error: null }) }
    expect(await readOrgCustomers(client, OWNER, '2026-11')).toEqual([{ memberUserId: STAFF, level: 2, contact: 'j***@example.com', signedUpAt: '2026-11-03T08:00:00Z', paidInPeriodCents: 100, paidTotalCents: 300 }])
  })
  it('adds the totals up', () => {
    const a = { allocated: 5, used: 1, l1: { signups: 1, paying: 1, paidCents: 100 }, l2: { signups: 0, paying: 0, paidCents: 0 } }
    const b = { allocated: 7, used: 2, l1: { signups: 2, paying: 0, paidCents: 50 }, l2: { signups: 3, paying: 2, paidCents: 900 } }
    expect(sumStats([a, b])).toEqual({ allocated: 12, used: 3, l1: { signups: 3, paying: 1, paidCents: 150 }, l2: { signups: 3, paying: 2, paidCents: 900 } })
    expect(sumStats([])).toEqual({ allocated: 0, used: 0, l1: { signups: 0, paying: 0, paidCents: 0 }, l2: { signups: 0, paying: 0, paidCents: 0 } })
  })
})
