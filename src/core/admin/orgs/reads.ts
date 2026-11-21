import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

import { AppError } from '@/core/errors'

import type { LedgerRow, LimitCaps, MemberRow, OrgDetail, OrgListItem, OrgPackage, OrgRow } from './types'

// Read side of the enterprise admin (ARCHITECTURE §6.5). The org tables have no client grant and
// the service role may select; every write goes through the E1 functions in core/org.

const ORG_FIELDS = 'id,name,owner_user_id,status,concurrency,per_window,batch_max,multi_template_max,batch_zip,early_features,affiliate_enabled,affiliate_levels,pool_credits,admin_note,created_at,updated_at'
const LEDGER_LIMIT = 100
const MEMBER_LIMIT = 100

const orgSchema = z.object({
  id: z.uuid(),
  name: z.string(),
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

export async function listOrgs(db: SupabaseClient): Promise<OrgListItem[]> {
  const rows = z.array(orgSchema).parse(ok(await db.from('orgs').select(ORG_FIELDS).order('created_at', { ascending: false }).limit(500), 'orgs'))
  if (rows.length === 0) return []
  const members = z.array(z.object({ org_id: z.uuid() })).parse(
    ok(await db.from('org_members').select('org_id').eq('status', 'active').limit(20000), 'member counts'),
  )
  const counts = new Map<string, number>()
  for (const m of members) counts.set(m.org_id, (counts.get(m.org_id) ?? 0) + 1)
  const accounts = await accountLabels(db, rows.map((row) => row.owner_user_id))
  return rows.map((row) => ({ ...toOrg(row), ownerAccount: accounts.get(row.owner_user_id) ?? null, memberCount: counts.get(row.id) ?? 0 }))
}

export async function loadOrgDetail(db: SupabaseClient, id: string): Promise<OrgDetail | null> {
  if (!z.uuid().safeParse(id).success) return null
  const found = ok(await db.from('orgs').select(ORG_FIELDS).eq('id', id).maybeSingle(), 'org')
  if (!found) return null
  const org = toOrg(orgSchema.parse(found))
  const [ledgerRows, memberRows, memberCount, packages, caps] = await Promise.all([
    db.from('org_credit_ledger').select('id,kind,delta,pool_after,member_user_id,package_id,amount_cny_fen,reference,note,created_at')
      .eq('org_id', id).order('created_at', { ascending: false }).order('id', { ascending: false }).limit(LEDGER_LIMIT),
    db.from('org_members').select('user_id,role,monthly_allowance,held_credits,status,joined_at')
      .eq('org_id', id).order('status').order('joined_at').order('user_id').limit(MEMBER_LIMIT),
    db.from('org_members').select('user_id', { count: 'exact' }).eq('org_id', id).limit(1),
    listPackages(db),
    loadLimitCaps(db),
  ])
  const ledger = z.array(ledgerSchema).parse(ok(ledgerRows, 'ledger'))
  const members = z.array(memberSchema).parse(ok(memberRows, 'members'))
  const total = memberCount.count ?? members.length
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
  }
}
