import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { decodeCursor, toPage } from '@/core/admin/cursor'
import { checked, commission, commissionColumns, memberDetail, pageQuery, rateRow } from './read'

const cents = z.number().int().safe()
const id = z.union([z.number().int().safe().positive(), z.string().regex(/^[1-9]\d*$/)]).transform(String)
const directory = z.object({
  user_id: z.uuid(), slug: z.string(), status: z.string(), created_at: z.string(),
  name: z.string().nullable(), email: z.string().nullable(), phone: z.string().nullable(), source: z.string().nullable(),
  team_enabled: z.boolean(), team_count: cents.nonnegative().nullable(),
  total: cents, confirmed: cents, unwithdrawn: cents, paid: cents,
})
const detail = memberDetail.extend({
  ...directory.shape,
  registered_at: z.string().nullable(), approved_at: z.string().nullable(), approved_by: z.uuid().nullable(),
  admin_note: z.string().nullable(), rates: z.array(rateRow),
})
const audit = z.object({
  id, created_at: z.string(), action: z.string(), user_id: z.uuid(), target_id: z.string(), reason: z.string(),
})
const cursorBigint = z.string().regex(/^[1-9]\d{0,18}$/).refine((s) => s.length < 19 || s <= '9223372036854775807')
const change = z.object({
  id, at: z.string(), old_status: z.string().nullable(), new_status: z.string(), reason: z.string(),
  old_amount: cents.nullable(), new_amount: cents,
})

function identify<T extends z.infer<typeof directory>>(row: T) {
  const { total, ...data } = row
  return { ...data, earned: total, id: data.user_id }
}
export type Dossier = ReturnType<typeof identify<z.infer<typeof directory>>>
export type DossierDetail = ReturnType<typeof identify<z.infer<typeof detail>>>

function before(cursor: string | undefined, uuid: boolean) {
  const parsed = decodeCursor(cursor)
  const key = uuid ? z.uuid() : cursorBigint
  const ok = parsed && Number.isFinite(Date.parse(parsed.c)) && key.safeParse(parsed.i).success
  return { p_before_at: ok ? parsed.c : null, p_before_id: ok ? parsed.i : null }
}

type DirectoryFilters = { query?: string; cursor?: string; parent?: string; review?: 'pending' | 'rejected' }

export async function dossiers(db: SupabaseClient, actor: string, f: DirectoryFilters) {
  const rows = checked(await db.rpc('admin_affiliate_directory', {
    p_actor: actor, p_query: f.query || null, p_parent: f.parent ?? null, p_review: f.review ?? null, ...before(f.cursor, true),
  }))
  return toPage(directory.array().parse(rows).map(identify), (r) => r)
}
export async function dossier(db: SupabaseClient, actor: string, userId: string): Promise<DossierDetail | null> {
  const result = checked(await db.rpc('admin_affiliate_dossier', { p_actor: actor, p_user: userId }))
  const data = detail.nullable().parse(result)
  return data ? identify(data) : null
}
export async function dossierAudit(db: SupabaseClient, actor: string, userId: string, cursor?: string) {
  const rows = checked(await db.rpc('admin_affiliate_dossier_log', { p_actor: actor, p_user: userId, ...before(cursor, false) }))
  return toPage(audit.array().parse(rows), (r) => r)
}
export async function dossierChanges(db: SupabaseClient, actor: string, userId: string, level: 1 | 2, commissionId: string, cursor?: string) {
  const rows = checked(await db.rpc('admin_affiliate_commission_history', {
    p_actor: actor, p_user: userId, p_commission: commissionId, p_level: level, ...before(cursor, false),
  }))
  return toPage(change.array().parse(rows).map((r) => ({ ...r, created_at: r.at })), (r) => r)
}

const directRow = z.object({ affiliate_user_id: z.uuid(), partner: z.object({ slug: z.string() }) })
const commissionWithSource = commission.extend({ payment: z.object({ direct: directRow.array() }).optional() })

export async function dossierCommissions(db: SupabaseClient, userId: string, level: 1 | 2, cursor?: string) {
  // The level-one row on the same payment identifies whose sale generated the team reward.
  const source = ',payment:payments!payment_id(direct:affiliate_commissions!payment_id(affiliate_user_id,partner:affiliates!affiliate_user_id(slug)))'
  const columns = level === 2 ? commissionColumns + source : commissionColumns
  let q = pageQuery(db, 'affiliate_commissions', columns, cursor).eq('affiliate_user_id', userId).eq('level', level)
  if (level === 2) q = q.eq('payment.direct.level', 1)
  return toPage(commissionWithSource.array().parse(checked(await q)), ({ payment, ...r }) => {
    const direct = payment?.direct[0]
    return { ...r, direct: direct ? { user_id: direct.affiliate_user_id, slug: direct.partner.slug } : null }
  })
}
