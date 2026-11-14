import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { checked, rateRow } from './read'

export const overviewRow = z.object({
  revenue: z.number(),
  pending: z.number(),
  confirmed: z.number(),
  paid: z.number(),
  applications: z.number(),
  payout_count: z.number(),
  payout_total: z.number(),
  flagged: z.number(),
  errors: z.number(),
})
const found = z.object({
  user_id: z.uuid(),
  email: z.string().nullable(),
  slug: z.string().nullable(),
  referred_by: z.uuid().nullable(),
  referred_at: z.string().nullable(),
  referred_source: z.string().nullable(),
})
export async function overview(db: SupabaseClient, actor: string) {
  return overviewRow.parse(checked(await db.rpc('admin_affiliate_overview', { p_actor: actor })))
}
export async function findUser(db: SupabaseClient, actor: string, query: string) {
  if (!z.union([z.email(), z.uuid()]).safeParse(query).success) return null
  return found.nullable().parse(checked(await db.rpc('admin_affiliate_find_user', { p_actor: actor, p_query: query })))
}
const settingsRow = z.object({
  hold_days: z.number(),
  commission_months: z.number().int().positive().nullable(),
  payout_min_usd: z.number(),
  settlement_day: z.number(),
  apply_min_level: z.string(),
  terms_version: z.string(),
})
export async function settings(db: SupabaseClient) {
  const [s, r] = await Promise.all([
    db.from('affiliate_settings').select('hold_days,commission_months,payout_min_usd,settlement_day,apply_min_level,terms_version').single(),
    db.from('affiliate_rates').select('product_kind,l1_bp,l2_bp'),
  ])
  return { settings: settingsRow.parse(checked(s)), rates: rateRow.array().parse(checked(r)) }
}
