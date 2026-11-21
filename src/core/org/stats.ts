import 'server-only'

import { z } from 'zod'

import { callRpc, type RpcClient } from '../billing/rpc'

// Monthly performance of an enterprise org (ARCHITECTURE §6.5, card E5), read through the two
// read-only SQL functions of 1670–1671. The signed-in account's own id (`caller` / `owner`) comes
// from the server session; the functions check it again. Months are UTC calendar months.

const uuid = z.uuid()
const count = z.number().int().nonnegative()
const periodPattern = /^\d{4}-(0[1-9]|1[0-2])$/
const EARLIEST = '2025-01'

// 'YYYY-MM' of the UTC month `now` is in.
export const currentPeriod = (now: Date) => now.toISOString().slice(0, 7)

// A month from a query string: valid, not before the product existed, not in the future;
// anything else is the current month.
export function resolvePeriod(raw: string | null | undefined, now: Date): string {
  const current = currentPeriod(now)
  if (!raw || !periodPattern.test(raw) || raw < EARLIEST || raw > current) return current
  return raw
}

// The month before / after `period` (callers keep the result inside [EARLIEST, current]).
export function shiftPeriod(period: string, delta: number): string {
  const [year, month] = period.split('-').map(Number) as [number, number]
  const index = year * 12 + (month - 1) + delta
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`
}

export const canGoBack = (period: string) => period > EARLIEST

export type LevelStats = { signups: number; paying: number; paidCents: number }
export type MemberStats = {
  userId: string
  role: 'owner' | 'member'
  status: 'active' | 'removed'
  allocated: number
  used: number
  l1: LevelStats
  l2: LevelStats
}

const statsRow = z.object({
  member_user_id: uuid,
  member_role: z.enum(['owner', 'member']),
  member_status: z.enum(['active', 'removed']),
  allocated: z.number().int(),
  used: z.number().int(),
  l1_signups: count,
  l1_paying: count,
  l1_paid_cents: z.number().int(),
  l2_signups: count,
  l2_paying: count,
  l2_paid_cents: z.number().int(),
})

// Every member's month for the org's owner; only the caller's own row for staff. An outsider, or
// a member who has left, gets FORBIDDEN (NOT_ORG_MEMBER).
export async function readMemberStats(client: RpcClient, caller: string, orgId: string, period: string): Promise<MemberStats[]> {
  const rows = await callRpc(
    client,
    'org_member_stats',
    { p_caller: uuid.parse(caller), p_org_id: uuid.parse(orgId), p_period: z.string().regex(periodPattern).parse(period) },
    z.array(statsRow),
  )
  return rows.map((r) => ({
    userId: r.member_user_id, role: r.member_role, status: r.member_status, allocated: r.allocated, used: r.used,
    l1: { signups: r.l1_signups, paying: r.l1_paying, paidCents: r.l1_paid_cents },
    l2: { signups: r.l2_signups, paying: r.l2_paying, paidCents: r.l2_paid_cents },
  }))
}

export type StatsTotals = Pick<MemberStats, 'allocated' | 'used' | 'l1' | 'l2'>

export function sumStats(rows: readonly StatsTotals[]): StatsTotals {
  const level = (pick: (r: StatsTotals) => LevelStats): LevelStats => ({
    signups: rows.reduce((n, r) => n + pick(r).signups, 0),
    paying: rows.reduce((n, r) => n + pick(r).paying, 0),
    paidCents: rows.reduce((n, r) => n + pick(r).paidCents, 0),
  })
  return {
    allocated: rows.reduce((n, r) => n + r.allocated, 0),
    used: rows.reduce((n, r) => n + r.used, 0),
    l1: level((r) => r.l1),
    l2: level((r) => r.l2),
  }
}

export type OrgCustomer = {
  memberUserId: string
  level: 1 | 2
  // Masked by the function (j***@example.com, 138****5678); the report never sees the full address.
  contact: string
  signedUpAt: string
  paidInPeriodCents: number
  paidTotalCents: number
}

const customerRow = z.object({
  member_user_id: uuid,
  level: z.union([z.literal(1), z.literal(2)]),
  contact: z.string(),
  signed_up_at: z.string(),
  paid_in_period_cents: z.number().int(),
  paid_total_cents: z.number().int(),
})

// The customers of the month for the org's owner only (NOT_ORG_OWNER otherwise).
export async function readOrgCustomers(client: RpcClient, owner: string, period: string): Promise<OrgCustomer[]> {
  const rows = await callRpc(
    client,
    'org_member_customers',
    { p_owner: uuid.parse(owner), p_period: z.string().regex(periodPattern).parse(period) },
    z.array(customerRow),
  )
  return rows.map((r) => ({
    memberUserId: r.member_user_id, level: r.level, contact: r.contact, signedUpAt: r.signed_up_at,
    paidInPeriodCents: r.paid_in_period_cents, paidTotalCents: r.paid_total_cents,
  }))
}
