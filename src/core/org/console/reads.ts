import 'server-only'

import { cache } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

import { AppError } from '@/core/errors'
import { logger } from '@/core/logger'

import { getOrgPaymentAccounts } from '../payment-accounts'
import { readMemberPromoStats, readPoolMonth } from '../promo-actions'
import { currentPeriod, readCustomerCounts, readMemberStats } from '../stats'

import type { ConsoleMember, ConsolePackage, OrgView, OwnerConsole, PaymentAccountGroup, PoolMonthView, StaffCard, StaffLevel } from './types'

// Read side of the account centre's enterprise block. The org tables have no client grant and the
// service role may select (same as the admin page); every write goes through core/org. Everything
// here is scoped to the signed-in account's own org, found from org_members by their own id.

const MEMBER_LIMIT = 200
const orgSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  owner_user_id: z.uuid(),
  status: z.enum(['active', 'suspended']),
  pool_credits: z.number(),
  promo_pool_credits: z.number(),
  promo_expires_at: z.string().nullable(),
  default_paid_allowance: z.number().default(0),
  default_promo_allowance: z.number().default(0),
  invite_token: z.string(),
  ref_code: z.string(),
  affiliate_enabled: z.boolean(),
  affiliate_levels: z.union([z.literal(1), z.literal(2)]),
})
const seatSchema = z.object({
  org_id: z.uuid(),
  role: z.enum(['owner', 'member']),
  monthly_allowance: z.number(),
  held_credits: z.number(),
  promo_allowance: z.number().default(0),
  paid_allowance_custom: z.boolean().nullable().default(null),
  promo_allowance_custom: z.boolean().nullable().default(null),
})
const memberSchema = z.object({
  user_id: z.uuid(),
  role: z.enum(['owner', 'member']),
  monthly_allowance: z.number(),
  held_credits: z.number(),
  promo_allowance: z.number(),
  held_promo_credits: z.number(),
  paid_allowance_custom: z.boolean().nullable().default(null),
  promo_allowance_custom: z.boolean().nullable().default(null),
  joined_at: z.string(),
})

function ok<T>(result: { data: T; error: { message: string } | null }, what: string): T {
  if (result.error) throw new AppError('INTERNAL', `org console read failed: ${what}`, { cause: new Error(result.error.message) })
  return result.data
}

// `YYYY-MM-01T00:00:00.000Z` of the month `now` is in: the month the monthly top-up counts in.
export const monthStart = (now: Date) => `${now.toISOString().slice(0, 7)}-01T00:00:00.000Z`

// One auth lookup per account per request: the workspace's member list and its monthly report
// both label the same members (React's cache, keyed on the client and the id).
const authUser = cache(async (db: SupabaseClient, id: string) => (await db.auth.admin.getUserById(id)).data.user)

export async function accountLabels(db: SupabaseClient, ids: readonly string[], mask: (phone: string) => string): Promise<Map<string, string | null>> {
  const labels = await Promise.all([...new Set(ids)].map(async (id) => {
    const user = await authUser(db, id)
    return [id, user?.email || (user?.phone ? mask(user.phone) : null)] as const
  }))
  return new Map(labels)
}

async function activePackages(db: SupabaseClient): Promise<ConsolePackage[]> {
  const rows = z.array(z.object({ id: z.uuid(), name: z.string(), price_usd_cents: z.number(), credits: z.number() })).parse(
    ok(await db.from('org_packages').select('id,name,price_usd_cents,credits').eq('active', true).order('sort').order('created_at'), 'packages'),
  )
  return rows.map((p) => ({ id: p.id, name: p.name, priceUsdCents: p.price_usd_cents, credits: p.credits }))
}

// The enabled collecting-account groups for the owner (E3's org_payment_accounts_for_owner). A
// suspended org's owner still sees them, to be able to pay and resume. A failed read must not
// take the console down: null, and the panel says to contact us.
export async function readPaymentAccounts(db: SupabaseClient, owner: string): Promise<PaymentAccountGroup[] | null> {
  try {
    const rows = await getOrgPaymentAccounts(db, owner)
    return rows.map((row) => ({ kind: row.kind, details: row.details }))
  } catch (error) {
    logger.warn('org payment accounts unavailable', { code: error instanceof AppError ? error.code : 'UNKNOWN' })
    return null
  }
}

type Deps = { db: SupabaseClient; now?: Date; maskPhone?: (phone: string) => string }

async function ownerConsole({ db, mask, now }: { db: SupabaseClient; mask: (phone: string) => string; now: Date }, org: z.infer<typeof orgSchema>): Promise<OwnerConsole> {
  const [memberRows, total, packages, owner] = await Promise.all([
    db.from('org_members').select('user_id,role,monthly_allowance,held_credits,promo_allowance,held_promo_credits,paid_allowance_custom,promo_allowance_custom,joined_at').eq('org_id', org.id).eq('status', 'active')
      .order('joined_at').order('user_id').limit(MEMBER_LIMIT),
    db.from('org_members').select('user_id', { count: 'exact' }).eq('org_id', org.id).eq('status', 'active').limit(1),
    activePackages(db),
    db.from('profiles').select('credits').eq('id', org.owner_user_id).maybeSingle(),
  ])
  const members = z.array(memberSchema).parse(ok(memberRows, 'members'))
  const credits = z.object({ credits: z.number() }).nullable().parse(ok(owner, 'owner balance'))?.credits ?? 0
  const seat = members.find((m) => m.user_id === org.owner_user_id)
  const [counts, labels] = await Promise.all([readCustomerCounts(db, org.owner_user_id, org.id), accountLabels(db, members.map((m) => m.user_id), mask)])
  const [paymentAccounts, poolMonth] = await Promise.all([readPaymentAccounts(db, org.owner_user_id), readOwnerPoolMonth(db, org.owner_user_id, now)])
  const promoLive = org.promo_expires_at !== null && Date.parse(org.promo_expires_at) > now.getTime()
  return {
    kind: 'owner',
    org: { id: org.id, name: org.name, refCode: org.ref_code, status: org.status, poolCredits: org.pool_credits, affiliateEnabled: org.affiliate_enabled, affiliateLevels: org.affiliate_levels,
      promoPoolCredits: promoLive ? org.promo_pool_credits : 0, promoExpiresAt: promoLive ? org.promo_expires_at : null,
      defaultPaidAllowance: org.default_paid_allowance, defaultPromoAllowance: org.default_promo_allowance },
    inviteToken: org.invite_token,
    members: members.map((m): ConsoleMember => ({
      userId: m.user_id, account: labels.get(m.user_id) ?? null, role: m.role,
      ...allowances(m, org), heldCredits: m.held_credits, heldPromoCredits: promoLive ? m.held_promo_credits : 0,
      customers: counts.get(m.user_id)?.l1 ?? 0, joinedAt: m.joined_at,
    })),
    memberTotal: total.count ?? members.length,
    packages,
    // Mirrors org_deposit: credits minus the org's share, min(held, credits).
    depositable: Math.max(0, credits - Math.min(seat?.held_credits ?? 0, credits)),
    paymentAccounts,
    poolMonth,
  }
}

// The allowance of each kind in force, as _org_allowance (1899) decides it: a personal value, or
// the org default (an unset row with 0 follows the default).
export function allowances(m: Pick<z.infer<typeof memberSchema>, 'monthly_allowance' | 'promo_allowance' | 'paid_allowance_custom' | 'promo_allowance_custom'>,
  org: Pick<z.infer<typeof orgSchema>, 'default_paid_allowance' | 'default_promo_allowance'>) {
  const paidOwn = m.paid_allowance_custom ?? m.monthly_allowance > 0
  const promoOwn = m.promo_allowance_custom ?? m.promo_allowance > 0
  return {
    monthlyAllowance: paidOwn ? m.monthly_allowance : org.default_paid_allowance, paidFollowsDefault: !paidOwn,
    promoAllowance: promoOwn ? m.promo_allowance : org.default_promo_allowance, promoFollowsDefault: !promoOwn,
    paidUnset: m.paid_allowance_custom === null && m.monthly_allowance === 0,
    promoUnset: m.promo_allowance_custom === null && m.promo_allowance === 0,
  }
}

// This month's movements of both pools for the owner's panel. A failed read must not take the
// console down: null, and the panel leaves the month out.
async function readOwnerPoolMonth(db: SupabaseClient, owner: string, now: Date): Promise<PoolMonthView | null> {
  try {
    const month = await readPoolMonth(db, owner, currentPeriod(now))
    return { period: month.period, paid: { in: month.paid.in, allocated: month.paid.allocated, reclaimed: month.paid.reclaimed },
      promo: { granted: month.promo.granted, allocated: month.promo.allocated, reclaimed: month.promo.reclaimed, expired: month.promo.expired, held: month.promo.held } }
  } catch (error) {
    logger.warn('org pool month unavailable', { code: error instanceof AppError ? error.code : 'UNKNOWN' })
    return null
  }
}

// The member's own promotion numbers this month (staff variant: only their row); null if unread.
async function staffPromo(db: SupabaseClient, user: string, orgId: string, period: string): Promise<StaffCard['promo']> {
  try {
    const row = (await readMemberPromoStats(db, user, orgId, period)).find((r) => r.userId === user)
    return row ? { allowance: row.allowance, held: row.held, allocated: row.allocated, used: row.used } : null
  } catch (error) {
    logger.warn('org staff promo stats unavailable', { code: error instanceof AppError ? error.code : 'UNKNOWN' })
    return null
  }
}

// This month's customers and their spend for one member, from the staff variant of the report
// function (only the caller's own row). A failed read must not take the card down: null, and the
// card says the numbers are unavailable.
async function staffLevel(db: SupabaseClient, user: string, orgId: string, period: string, totals: Map<string, number>): Promise<{ l1: StaffLevel; l2: StaffLevel } | null> {
  try {
    const row = (await readMemberStats(db, user, orgId, period)).find((r) => r.userId === user)
    const level = (stats: { signups: number; paying: number; paidCents: number } | undefined, customers: number): StaffLevel => ({
      customers, signups: stats?.signups ?? 0, paying: stats?.paying ?? 0, paidCents: stats?.paidCents ?? 0,
    })
    return { l1: level(row?.l1, totals.get('org_l1') ?? 0), l2: level(row?.l2, totals.get('org_l2') ?? 0) }
  } catch (error) {
    logger.warn('org staff stats unavailable', { code: error instanceof AppError ? error.code : 'UNKNOWN' })
    return null
  }
}

async function staffCard(db: SupabaseClient, now: Date, org: z.infer<typeof orgSchema>, seat: z.infer<typeof seatSchema>, user: string): Promise<StaffCard> {
  const withLevel2 = org.affiliate_enabled && org.affiliate_levels === 2
  const period = currentPeriod(now)
  const [ledger, counts] = await Promise.all([
    db.from('org_credit_ledger').select('delta').eq('org_id', org.id).eq('member_user_id', user).eq('kind', 'allocate').gte('created_at', monthStart(now)).limit(1000),
    readCustomerCounts(db, user, org.id),
  ])
  const given = z.array(z.object({ delta: z.number() })).parse(ok(ledger, 'allocations')).reduce((sum, row) => sum - row.delta, 0)
  const [performance, promo] = await Promise.all([
    staffLevel(db, user, org.id, period, new Map([['org_l1', counts.get(user)?.l1 ?? 0], ['org_l2', counts.get(user)?.l2 ?? 0]])),
    staffPromo(db, user, org.id, period),
  ])
  return {
    kind: 'member', orgName: org.name, status: org.status, monthlyAllowance: allowances(seat, org).monthlyAllowance,
    allocatedThisMonth: given, heldCredits: seat.held_credits, promo, customers: counts.get(user)?.l1 ?? 0,
    withLevel2, period, performance, affiliateEnabled: org.affiliate_enabled,
  }
}

// The org the account belongs to, as its owner's console or a member's card; none for everyone else.
export async function readOrgView(user: string, { db, now = new Date(), maskPhone = (phone) => phone }: Deps): Promise<OrgView> {
  const seatRow = ok(await db.from('org_members').select('org_id,role,monthly_allowance,held_credits,promo_allowance,paid_allowance_custom,promo_allowance_custom').eq('user_id', user).eq('status', 'active').maybeSingle(), 'seat')
  if (!seatRow) return { kind: 'none' }
  const seat = seatSchema.parse(seatRow)
  const found = ok(await db.from('orgs').select('id,name,owner_user_id,status,pool_credits,promo_pool_credits,promo_expires_at,default_paid_allowance,default_promo_allowance,invite_token,ref_code,affiliate_enabled,affiliate_levels').eq('id', seat.org_id).maybeSingle(), 'org')
  if (!found) return { kind: 'none' }
  const org = orgSchema.parse(found)
  // The owner is the org's owner_user_id; a member row says role = 'member' for everyone else.
  if (org.owner_user_id === user && seat.role === 'owner') return ownerConsole({ db, mask: maskPhone, now }, org)
  return staffCard(db, now, org, seat, user)
}

const inviteOrgSchema = z.object({ id: z.uuid(), name: z.string(), status: z.enum(['active', 'suspended']) })
export type InviteOrg = z.infer<typeof inviteOrgSchema>

// Just enough of an invite link's org for the join page: its name and whether it takes people.
export async function readInviteOrg(db: SupabaseClient, token: string): Promise<InviteOrg | null> {
  if (!/^[0-9a-f]{32}$/.test(token)) return null
  const row = ok(await db.from('orgs').select('id,name,status').eq('invite_token', token).maybeSingle(), 'invite org')
  return row ? inviteOrgSchema.parse(row) : null
}

// The org id a signed-in account is already in (the join page says so instead of offering a second one).
export async function readSeatOrgId(db: SupabaseClient, user: string): Promise<string | null> {
  const seat = ok(await db.from('org_members').select('org_id').eq('user_id', user).eq('status', 'active').maybeSingle(), 'seat')
  return seat ? z.object({ org_id: z.uuid() }).parse(seat).org_id : null
}
