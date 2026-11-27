import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

import { AppError } from '@/core/errors'
import { PAYMENT_KINDS, type PaymentKind } from '@/core/org'
import { parseRefCode } from '@/core/org/ref-code'

import type { PaymentAccountRow, LedgerRow, LimitCaps, MemberRow, OrgAffiliate, OrgCustomer, OrgCustomerBonus, OrgCustomerCounts, OrgCustomerPage, OrgDetail, OrgListItem, OrgPackage, OrgRow } from './types'

// Read side of the enterprise admin (ARCHITECTURE §6.5). The org tables have no client grant and
// the service role may select; every write goes through the E1 functions in core/org.

const ORG_FIELDS = 'id,name,ref_code,owner_user_id,status,concurrency,per_window,batch_max,multi_template_max,batch_zip,early_features,affiliate_enabled,affiliate_levels,signup_bonus_credits,pool_credits,admin_note,created_at,updated_at'
const LEDGER_LIMIT = 100
const MEMBER_LIMIT = 100

const orgSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  ref_code: z.string(),
  owner_user_id: z.uuid(),
  status: z.enum(['active', 'suspended']),
  concurrency: z.number().nullable(),
  per_window: z.number().nullable(),
  batch_max: z.number().nullable(),
  multi_template_max: z.number().nullable(),
  batch_zip: z.boolean(),
  early_features: z.boolean(),
  affiliate_enabled: z.boolean(),
  affiliate_levels: z.union([z.literal(1), z.literal(2)]),
  signup_bonus_credits: z.number(),
  pool_credits: z.number(),
  admin_note: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
})

const packageSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  price_usd_cents: z.number(),
  credits: z.number(),
  active: z.boolean(),
  sort: z.number(),
  updated_at: z.string(),
})

const ledgerSchema = z.object({
  id: z.number(),
  kind: z.string(),
  delta: z.number(),
  pool_after: z.number(),
  member_user_id: z.uuid().nullable(),
  package_id: z.uuid().nullable(),
  amount_cny_fen: z.number().nullable(),
  reference: z.string().nullable(),
  note: z.string().nullable(),
  created_at: z.string(),
})

const memberSchema = z.object({
  user_id: z.uuid(),
  role: z.enum(['owner', 'member']),
  monthly_allowance: z.number(),
  held_credits: z.number(),
  status: z.enum(['active', 'removed']),
  joined_at: z.string(),
})

function ok<T>(result: { data: T; error: { message: string } | null }, what: string): T {
  if (result.error) throw new AppError('INTERNAL', `org admin read failed: ${what}`, { cause: new Error(result.error.message) })
  return result.data
}

function toOrg(row: z.infer<typeof orgSchema>): OrgRow {
  return {
    id: row.id,
    name: row.name,
    refCode: row.ref_code,
    ownerUserId: row.owner_user_id,
    status: row.status,
    concurrency: row.concurrency,
    perWindow: row.per_window,
    batchMax: row.batch_max,
    multiTemplateMax: row.multi_template_max,
    batchZip: row.batch_zip,
    earlyFeatures: row.early_features,
    affiliateEnabled: row.affiliate_enabled,
    affiliateLevels: row.affiliate_levels,
    signupBonusCredits: row.signup_bonus_credits,
    poolCredits: row.pool_credits,
    adminNote: row.admin_note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function toPackage(row: z.infer<typeof packageSchema>): OrgPackage {
  return { id: row.id, name: row.name, priceUsdCents: row.price_usd_cents, credits: row.credits, active: row.active, sort: row.sort, updatedAt: row.updated_at }
}

// Email, or the phone for a phone-only account; read live from Auth, never copied.
async function accountLabels(db: SupabaseClient, ids: readonly string[]): Promise<Map<string, string | null>> {
  const unique = [...new Set(ids)]
  const labels = await Promise.all(unique.map(async (id) => {
    const { data } = await db.auth.admin.getUserById(id)
    return [id, data.user?.email || data.user?.phone || null] as const
  }))
  return new Map(labels)
}

export async function loadLimitCaps(db: SupabaseClient): Promise<LimitCaps> {
  const row = ok(await db.from('system_settings').select('value').eq('key', 'org_limit_caps').maybeSingle(), 'caps')
  const parsed = z.record(z.string(), z.number()).safeParse(row?.value)
  if (!parsed.success) return {}
  const caps = parsed.data
  return { concurrency: caps.concurrency, per_window: caps.per_window, batch_max: caps.batch_max, multi_template_max: caps.multi_template_max }
}

export async function listPackages(db: SupabaseClient): Promise<OrgPackage[]> {
  const rows = ok(await db.from('org_packages').select('id,name,price_usd_cents,credits,active,sort,updated_at').order('sort').order('created_at'), 'packages')
  return z.array(packageSchema).parse(rows).map(toPackage)
}

// `query`: an enterprise number (exact, any case) or part of an org's name; empty lists the newest 500.
export async function listOrgs(db: SupabaseClient, query = ''): Promise<OrgListItem[]> {
  const base = db.from('orgs').select(ORG_FIELDS)
  const q = query.trim().slice(0, 120)
  const code = parseRefCode(q)
  const filtered = code ? base.eq('ref_code', code) : q ? base.ilike('name', '%' + q.replace(/[\\%_]/g, (c) => '\\' + c) + '%') : base
  const rows = z.array(orgSchema).parse(ok(await filtered.order('created_at', { ascending: false }).limit(500), 'orgs'))
  if (rows.length === 0) return []
  const members = z.array(z.object({ org_id: z.uuid() })).parse(
    ok(await db.from('org_members').select('org_id').eq('status', 'active').limit(20000), 'member counts'),
  )
  const counts = new Map<string, number>()
  for (const m of members) counts.set(m.org_id, (counts.get(m.org_id) ?? 0) + 1)
  const accounts = await accountLabels(db, rows.map((row) => row.owner_user_id))
  return rows.map((row) => ({ ...toOrg(row), ownerAccount: accounts.get(row.owner_user_id) ?? null, memberCount: counts.get(row.id) ?? 0 }))
}

const accountSchema = z.object({ user_id: z.uuid(), slug: z.string(), status: z.string() })
const rateSchema = z.object({ product_kind: z.string(), l1_bp: z.number(), org_l2_bp: z.number() })
const overrideSchema = z.object({ product_kind: z.string(), l1_bp: z.number().nullable(), l2_bp: z.number().nullable() })

// No account row until the affiliate switch was turned on (E2 creates it then).
export async function loadOrgAffiliate(db: SupabaseClient, orgId: string): Promise<OrgAffiliate | null> {
  const account = ok(await db.from('affiliates').select('user_id,slug,status').eq('org_id', orgId).maybeSingle(), 'affiliate account')
  if (!account) return null
  const row = accountSchema.parse(account)
  const [defaults, overrides] = await Promise.all([
    db.from('affiliate_rates').select('product_kind,l1_bp,org_l2_bp').order('product_kind'),
    db.from('affiliate_rate_overrides').select('product_kind,l1_bp,l2_bp').eq('user_id', row.user_id),
  ])
  // Level 2 of an org falls back to that kind's org default, not the personal team bonus (migration 1900).
  const over = new Map(z.array(overrideSchema).parse(ok(overrides, 'rate overrides')).map((o) => [o.product_kind, o]))
  return {
    userId: row.user_id, slug: row.slug, status: row.status,
    rates: z.array(rateSchema).parse(ok(defaults, 'rates')).map((d) => {
      const o = over.get(d.product_kind)
      return { productKind: d.product_kind, l1Bp: o?.l1_bp ?? d.l1_bp, l2Bp: o?.l2_bp ?? d.org_l2_bp, overridden: Boolean(o && (o.l1_bp !== null || o.l2_bp !== null)) }
    }),
  }
}

export async function loadOrgDetail(db: SupabaseClient, id: string): Promise<OrgDetail | null> {
  if (!z.uuid().safeParse(id).success) return null
  const found = ok(await db.from('orgs').select(ORG_FIELDS).eq('id', id).maybeSingle(), 'org')
  if (!found) return null
  const org = toOrg(orgSchema.parse(found))
  const [ledgerRows, memberRows, memberCount, packages, caps, affiliate, bonusCount] = await Promise.all([
    db.from('org_credit_ledger').select('id,kind,delta,pool_after,member_user_id,package_id,amount_cny_fen,reference,note,created_at')
      .eq('org_id', id).order('created_at', { ascending: false }).order('id', { ascending: false }).limit(LEDGER_LIMIT),
    db.from('org_members').select('user_id,role,monthly_allowance,held_credits,status,joined_at')
      .eq('org_id', id).order('status').order('joined_at').order('user_id').limit(MEMBER_LIMIT),
    db.from('org_members').select('user_id', { count: 'exact' }).eq('org_id', id).limit(1),
    listPackages(db),
    loadLimitCaps(db),
    loadOrgAffiliate(db, id),
    db.from('org_signup_bonuses').select('user_id', { count: 'exact' }).eq('org_id', id).limit(1),
  ])
  const ledger = z.array(ledgerSchema).parse(ok(ledgerRows, 'ledger'))
  const members = z.array(memberSchema).parse(ok(memberRows, 'members'))
  const total = memberCount.count ?? members.length
  ok(bonusCount, 'signup bonuses')
  const accounts = await accountLabels(db, [org.ownerUserId, ...members.map((m) => m.user_id), ...ledger.flatMap((l) => (l.member_user_id ? [l.member_user_id] : []))])
  const packageNames = new Map(packages.map((p) => [p.id, p.name]))
  return {
    org,
    ownerAccount: accounts.get(org.ownerUserId) ?? null,
    members: members.map((m): MemberRow => ({
      userId: m.user_id, account: accounts.get(m.user_id) ?? null, role: m.role, monthlyAllowance: m.monthly_allowance,
      heldCredits: m.held_credits, status: m.status, joinedAt: m.joined_at,
    })),
    memberTotal: total,
    ledger: ledger.map((l): LedgerRow => ({
      id: l.id, kind: l.kind, delta: l.delta, poolAfter: l.pool_after,
      memberAccount: l.member_user_id ? accounts.get(l.member_user_id) ?? null : null,
      packageName: l.package_id ? packageNames.get(l.package_id) ?? null : null,
      amountCnyFen: l.amount_cny_fen, reference: l.reference, note: l.note, createdAt: l.created_at,
    })),
    packages,
    caps,
    affiliate,
    signupBonusUsers: bonusCount.count ?? 0,
  }
}

// Admin only (the caller checked the role): the saved receiving accounts, a group never saved is absent.
export async function listPaymentAccounts(db: SupabaseClient): Promise<Partial<Record<PaymentKind, PaymentAccountRow>>> {
  const schema = z.object({ kind: z.enum(PAYMENT_KINDS), enabled: z.boolean(), details: z.record(z.string(), z.string()), updated_at: z.string() })
  const rows = z.array(schema).parse(ok(await db.from('org_payment_accounts').select('kind,enabled,details,updated_at'), 'payment accounts'))
  return Object.fromEntries(rows.map((r) => [r.kind, { enabled: r.enabled, details: r.details, updatedAt: r.updated_at }]))
}

// The org's staff-only join link token (orgs.invite_token, the one the owner's 员工专用链接 shows;
// Owner 2026-11-23: the admin sends it to enterprise customers). Read here, apart from the org row
// the edit forms receive, so it reaches only the link card. Never logged. null for a missing org.
export async function loadOrgInviteToken(db: SupabaseClient, orgId: string): Promise<string | null> {
  const row = ok(await db.from('orgs').select('invite_token').eq('id', orgId).maybeSingle(), 'org invite')
  return z.object({ invite_token: z.string().regex(/^[0-9a-f]{32}$/) }).nullable().parse(row)?.invite_token ?? null
}

export const CUSTOMER_PAGE_SIZE = 50

const customerSchema = z.object({
  user_id: z.uuid(),
  contact: z.string().nullable(),
  level: z.union([z.literal(1), z.literal(2)]),
  source: z.string().nullable(),
  member_user_id: z.uuid().nullable(),
  member_contact: z.string().nullable(),
  via_user_id: z.uuid().nullable(),
  via_contact: z.string().nullable(),
  signed_up_at: z.string(),
  referred_at: z.string().nullable(),
  bonus_credits: z.number().nullable(),
  bonus_at: z.string().nullable(),
  bonus_error: z.string().nullable(),
  paid_before: z.boolean(),
  has_signup_gift: z.boolean(),
  paid_cents: z.coerce.number(),
  commission_cents: z.coerce.number(),
  promo_credits: z.coerce.number(),
  total: z.coerce.number(),
  total_l2: z.coerce.number(),
})

// Why a customer has no bonus and no recorded refusal, from how they were bound (1690, 2010). The
// Owner's rule: whoever the org admin's or a staff member's promotion link brings in gets it;
// level 2 (invited by a customer) does not.
export function customerBonus(row: Pick<z.infer<typeof customerSchema>, 'bonus_credits' | 'bonus_at' | 'bonus_error' | 'level' | 'source' | 'paid_before' | 'has_signup_gift'>): OrgCustomerBonus {
  if (row.bonus_credits !== null && row.bonus_at) return { kind: 'granted', credits: row.bonus_credits, at: row.bonus_at }
  if (row.bonus_error) return { kind: 'error', error: row.bonus_error }
  if (row.level === 2) return { kind: 'none', reason: 'level2' }
  if (row.paid_before) return { kind: 'none', reason: 'paid_before' }
  if (row.source === 'first_checkout') return { kind: 'none', reason: 'first_checkout' }
  if (!row.has_signup_gift) return { kind: 'none', reason: 'no_signup_gift' }
  if (row.source === 'signup') return { kind: 'none', reason: 'ref_link' }
  if (row.source === 'org_l1') return { kind: 'none', reason: 'off' }
  return { kind: 'none', reason: 'other' }
}

// 推广名单: one page (1-based) of the org's customers, newest binding first, in one database call.
// Admin only (the caller checked the role). An org without an affiliate account has none.
// Staff of the org are never listed. A page past the end is empty with total 0; the view then
// links back to the first page.
export async function loadOrgCustomers(db: SupabaseClient, orgId: string, page: number): Promise<OrgCustomerPage> {
  const current = Number.isInteger(page) && page > 0 ? Math.min(page, 10000) : 1
  const rows = await db.rpc('admin_org_customers', { p_org_id: orgId, p_limit: CUSTOMER_PAGE_SIZE, p_offset: (current - 1) * CUSTOMER_PAGE_SIZE })
  const parsed = z.array(customerSchema).parse(ok(rows, 'customers') ?? [])
  return {
    rows: parsed.map((r): OrgCustomer => ({
      userId: r.user_id, contact: r.contact, level: r.level, source: r.source,
      memberUserId: r.member_user_id, memberContact: r.member_contact, viaUserId: r.via_user_id, viaContact: r.via_contact,
      signedUpAt: r.signed_up_at, referredAt: r.referred_at, bonus: customerBonus(r),
      paidCents: r.paid_cents, commissionCents: r.commission_cents, promoCredits: r.promo_credits,
    })),
    total: parsed[0]?.total ?? 0,
    page: current,
    pageSize: CUSTOMER_PAGE_SIZE,
  }
}

// The overview's customer numbers, counted exactly as 推广名单 lists them (staff left out).
export async function loadOrgCustomerCounts(db: SupabaseClient, orgId: string): Promise<OrgCustomerCounts> {
  const rows = await db.rpc('admin_org_customers', { p_org_id: orgId, p_limit: 1, p_offset: 0 })
  const first = z.array(customerSchema).parse(ok(rows, 'customer counts') ?? [])[0]
  return { l1: first ? first.total - first.total_l2 : 0, l2: first?.total_l2 ?? 0 }
}
