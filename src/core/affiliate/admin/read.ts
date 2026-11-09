import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { AppError } from '@/core/errors'
import { decodeCursor, PAGE_SIZE, toPage } from '@/core/admin/cursor'
import { endExclusive, type Filters } from './query'

export function checked<T>(result: { data: T; error: { message: string } | null }): T {
  if (result.error) throw new AppError('INTERNAL', 'Affiliate admin read failed', { cause: new Error(result.error.message) })
  return result.data
}
const id = z.union([z.number().int().positive(), z.string().min(1)]).transform(String)
export const rateRow = z.object({ product_kind: z.string(), l1_bp: z.number().nullable(), l2_bp: z.number().nullable() })
const common = { id, created_at: z.string() }
const baseMember = { user_id: z.uuid(), slug: z.string(), status: z.string(), created_at: z.string() }
const member = z.object(baseMember)
export const memberDetail = member.extend({
  team_enabled: z.boolean(),
  parent_user_id: z.uuid().nullable(),
  country: z.string().nullable(),
  payout_method: z.string().nullable(),
  payout_details: z.string().nullable(),
  us_person: z.boolean().nullable(),
  application: z.record(z.string(), z.unknown()).nullable(),
  reject_reason: z.string().nullable(),
  terms_version: z.string().nullable(),
  terms_accepted_at: z.string().nullable(),
})
const commission = z.object({
  ...common,
  payment_id: id,
  affiliate_user_id: z.uuid(),
  level: z.number(),
  rate_bp: z.number(),
  amount: z.number(),
  status: z.string(),
  base_usd: z.number(),
  flags: z.array(z.string()),
  released_by: z.uuid().nullable(),
  confirm_after: z.string(),
  product_id: z.string(),
})
const snapshot = z.record(z.string(), z.unknown())
const payout = z.object({
  ...common,
  affiliate_user_id: z.uuid(),
  period: z.string(),
  amount: z.number(),
  status: z.string(),
  payout_snapshot: snapshot,
  paid_at: z.string().nullable(),
  paid_reference: z.string().nullable(),
  note: z.string().nullable(),
  paid_method: z.string().nullable(),
  owner: z.object({ risks: z.array(z.object({ id, flags: z.array(z.string()) })) }).optional(),
})
export type Commission = z.infer<typeof commission>
export type Payout = z.infer<typeof payout>
export type Member = z.infer<typeof memberDetail>

// Timestamp and tie-breaker column names are constants at each call. decodeCursor validates both values.
function pageQuery(db: SupabaseClient, table: string, cols: string, cursor?: string, key = 'id', time = 'created_at') {
  let query = db
    .from(table)
    .select(cols)
    .order(time, { ascending: false })
    .order(key, { ascending: false })
    .limit(PAGE_SIZE + 1)
  const after = decodeCursor(cursor)
  if (after) query = query.or(`${time}.lt."${after.c}",and(${time}.eq."${after.c}",${key}.lt.${after.i})`)
  return query
}
export async function members(db: SupabaseClient, f: Filters) {
  let q = pageQuery(db, 'affiliates', 'user_id,slug,status,created_at', f.cursor, 'user_id')
  if (f.tab === 'applications') q = q.eq('status', 'pending').or('application->>source.is.null,application->>source.neq.admin_invite')
  if (f.q) q = z.uuid().safeParse(f.q).success ? q.eq('user_id', f.q) : q.ilike('slug', f.q.replace(/[\\%_]/g, '\\$&') + '%')
  return toPage(
    member
      .array()
      .parse(checked(await q))
      .map((r) => ({ ...r, id: r.user_id })),
    (r) => r,
  )
}
export async function loadMember(db: SupabaseClient, userId: string) {
  const [result, rates] = await Promise.all([
    db
      .from('affiliates')
      .select(
        'user_id,slug,status,created_at,team_enabled,parent_user_id,country,payout_method,payout_details,us_person,application,reject_reason,terms_version,terms_accepted_at',
      )
      .eq('user_id', userId)
      .maybeSingle(),
    db.from('affiliate_rate_overrides').select('product_kind,l1_bp,l2_bp').eq('user_id', userId),
  ])
  return { member: memberDetail.nullable().parse(checked(result)), rates: rateRow.array().parse(checked(rates)) }
}
function withFilters(q: ReturnType<typeof pageQuery>, f: Filters) {
  if (f.affiliate) q = q.eq('affiliate_user_id', f.affiliate)
  if (f.from) q = q.gte('created_at', f.from + 'T00:00:00Z')
  if (f.until) q = q.lt('created_at', endExclusive(f.until))
  if (f.status) q = q.eq('status', f.status)
  return q
}
export async function commissions(db: SupabaseClient, f: Filters) {
  const columns =
    'id,created_at,payment_id,affiliate_user_id,level,rate_bp,amount,status,base_usd,flags,released_by,confirm_after,product_id'
  let q = withFilters(pageQuery(db, 'affiliate_commissions', columns, f.cursor), f)
  if (f.flag === 'yes') q = q.neq('flags', '{}')
  if (f.flag === 'no') q = q.eq('flags', '{}')
  return toPage(commission.array().parse(checked(await q)), (r) => r)
}
export async function payouts(db: SupabaseClient, f: Filters, includeFlags = false) {
  const cols = 'id,created_at,affiliate_user_id,period,amount,status,payout_snapshot,paid_at,paid_reference,note'
  const fields = cols + ',paid_method' + (includeFlags ? ',owner:affiliates(risks:affiliate_commissions(id,flags))' : '')
  let q = withFilters(pageQuery(db, 'affiliate_payouts', fields, f.cursor), f)
  if (includeFlags)
    q = q
      .neq('owner.risks.flags', '{}')
      .order('id', { referencedTable: 'owner.risks', ascending: false })
      .limit(5, { referencedTable: 'owner.risks' })
  if (f.period) q = q.eq('period', f.period)
  return toPage(payout.array().parse(checked(await q)), (r) => r)
}
export async function errors(db: SupabaseClient, f: Filters) {
  const q = pageQuery(db, 'affiliate_recompute_errors', 'id,at,payment_id,error', f.cursor, 'id', 'at').is('resolved_at', null)
  const rows = z.array(z.object({ id, at: z.string(), payment_id: id, error: z.string() })).parse(checked(await q))
  return toPage(
    rows.map((r) => ({ ...r, created_at: r.at })),
    (r) => r,
  )
}
export async function referred(db: SupabaseClient, userId: string, cursor?: string) {
  const q = pageQuery(db, 'profiles', 'id,referred_at,referred_source', cursor, 'id', 'referred_at').eq('referred_by', userId)
  const rows = z.array(z.object({ id: z.uuid(), referred_at: z.string(), referred_source: z.string() })).parse(checked(await q))
  return toPage(
    rows.map((r) => ({ ...r, created_at: r.referred_at })),
    (r) => r,
  )
}
export async function adjustments(db: SupabaseClient, userId: string, cursor?: string) {
  const cols = 'id,created_at,amount,reason'
  const q = pageQuery(db, 'affiliate_adjustments', cols, cursor).eq('affiliate_user_id', userId)
  return toPage(z.array(z.object({ ...common, amount: z.number(), reason: z.string() })).parse(checked(await q)), (r) => r)
}
