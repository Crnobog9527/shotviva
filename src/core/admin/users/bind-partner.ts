import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

import { AppError } from '@/core/errors'

import { partnerName } from './referrer'
import { BACKDATE_MAX_DAYS, type BindOutcome, type PartnerOption } from './bind-partner-types'

// 后台手动绑定渠道 (migration 2029, ARCHITECTURE §6.5): binds an account, also one that already paid,
// to a personal affiliate or an enterprise account, optionally with commissions on its payments of
// the last N days. The actor is the signed-in admin from the server session; the SQL function
// checks the role again, refuses what cannot be bound, never takes over another partner's
// commission and writes the audit log.

const bindInput = z.object({
  userId: z.uuid(),
  partnerId: z.uuid(),
  reason: z.string().trim().min(1).max(2000),
  backdateDays: z.number().int().min(0).max(BACKDATE_MAX_DAYS),
})

const KNOWN: Record<string, string> = {
  INVALID_INPUT: '填写不完整：选一个渠道、写上原因，往前计佣天数 0–90。账号不能绑给自己。',
  NOT_ADMIN: '只有管理员可以绑定渠道。',
  USER_NOT_FOUND: '找不到这个账号。',
  USER_BANNED: '这个账号已封禁，不能绑定渠道。',
  AFFILIATE_NOT_ACTIVE: '这个渠道不是已通过的联盟账号（待审核、已暂停或已封禁），不能绑定。',
  AFFILIATE_ORG_MEMBER: '这个账号是该企业的在职员工，员工不算企业客户。',
  AFFILIATE_PROGRAM_OFF: '联盟营销总开关关着，不能往前计佣；可以先不勾往前计佣，只绑定。',
  AFFILIATE_BACKDATE_NOT_ADMIN: '这个账号已经是该渠道经推广链接或邀请码带来的客户，绑定之前的付款不补算佣金。',
}

const outcome = z.object({
  changed: z.boolean(),
  created: z.number().int(),
  already: z.number().int(),
  other_partner: z.number().int(),
  failed: z.number().int(),
})

export async function bindPartner(db: SupabaseClient, actorId: string, raw: unknown): Promise<BindOutcome> {
  const parsed = bindInput.safeParse(raw)
  if (!parsed.success) throw new AppError('INVALID_INPUT', KNOWN.INVALID_INPUT)
  const { userId, partnerId, reason, backdateDays } = parsed.data
  const { data, error } = await db.rpc('admin_affiliate_bind_customer', {
    p_actor: actorId,
    p_input: { user_id: userId, affiliate_user_id: partnerId, reason, backdate_days: backdateDays },
  })
  if (error) {
    const known = KNOWN[error.message]
    if (known) throw new AppError('INVALID_INPUT', known)
    throw new AppError('INTERNAL', 'admin bind partner failed', { cause: new Error(error.message) })
  }
  const r = outcome.parse(data)
  return { changed: r.changed, created: r.created, already: r.already, otherPartner: r.other_partner, failed: r.failed }
}

const searchInput = z.object({ query: z.string().trim().min(2).max(200) })
const directoryRow = z.object({ user_id: z.string(), slug: z.string(), status: z.string(), name: z.string().nullable(), admin_label: z.string().nullable() })
const accountRow = z.object({ user_id: z.string(), slug: z.string(), status: z.string(), org_id: z.string().nullable(), admin_label: z.string().nullable(), name: z.string().nullable() })
const orgRow = z.object({ id: z.string(), name: z.string() })
const LIMIT = 10

function failed(what: string, error: { message: string }): never {
  throw new AppError('INTERNAL', `admin partner search failed: ${what}`, { cause: new Error(error.message) })
}

function rowsOf<T>(schema: z.ZodType<T>, result: { data: unknown; error: { message: string } | null }, what: string): T[] {
  if (result.error) failed(what, result.error)
  return z.array(schema).parse(result.data ?? [])
}

const idRow = z.object({ user_id: z.string() })

// Affiliate account ids matching the query: the directory's search (code, applicant name, admin
// tag, exact email, phone or user id), then the accounts of enterprises whose name contains it.
async function matchingIds(db: SupabaseClient, actorId: string, query: string): Promise<string[]> {
  const pattern = `%${query.replace(/[\\%_]/g, (c) => `\\${c}`)}%`
  const [directory, orgs] = await Promise.all([
    db.rpc('admin_affiliate_directory_v2', { p_actor: actorId, p_query: query }),
    db.from('orgs').select('id,name').ilike('name', pattern).limit(LIMIT),
  ])
  const direct = rowsOf(directoryRow, directory, 'directory').map((r) => r.user_id)
  const orgIds = rowsOf(orgRow, orgs, 'orgs').map((o) => o.id)
  const byOrg = orgIds.length
    ? rowsOf(idRow, await db.from('affiliates').select('user_id').in('org_id', orgIds), 'org accounts').map((r) => r.user_id)
    : []
  return [...new Set([...direct, ...byOrg])].slice(0, LIMIT * 2)
}

async function orgNames(db: SupabaseClient, orgIds: string[]): Promise<Map<string, string>> {
  if (orgIds.length === 0) return new Map()
  return new Map(rowsOf(orgRow, await db.from('orgs').select('id,name').in('id', orgIds), 'org names').map((o) => [o.id, o.name]))
}

// The partner picker, at most ten. Every status is listed; the dialog only lets an active one be
// picked (the SQL function refuses the rest anyway).
export async function searchPartners(db: SupabaseClient, actorId: string, raw: unknown): Promise<PartnerOption[]> {
  const parsed = searchInput.safeParse(raw)
  if (!parsed.success) return []
  const ids = await matchingIds(db, actorId, parsed.data.query)
  if (ids.length === 0) return []
  const rows = rowsOf(accountRow, await db.from('affiliates').select('user_id,slug,status,org_id,admin_label,name:application->>name').in('user_id', ids), 'accounts')
  const names = await orgNames(db, [...new Set(rows.flatMap((r) => (r.org_id ? [r.org_id] : [])))])
  const order = new Map(ids.map((id, i) => [id, i]))
  return rows
    .sort((a, b) => (order.get(a.user_id) ?? 0) - (order.get(b.user_id) ?? 0))
    .slice(0, LIMIT)
    .map((r) => ({
      id: r.user_id,
      name: partnerName(r, r.org_id ? (names.get(r.org_id) ?? null) : null),
      slug: r.slug,
      status: r.status,
      enterprise: r.org_id !== null,
    }))
}
