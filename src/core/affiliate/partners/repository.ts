import 'server-only'
import { z } from 'zod'
import { createAdminSupabase } from '@/core/auth'
import { logger } from '@/core/logger'
import { AppError } from '@/core/errors'
import { afterCursor, decodeCursor, PAGE_SIZE, toPage, type Page } from '@/core/admin/cursor'
import {
  accountSchema,
  commissionSchema,
  settingsSchema,
  summarySchema,
  referralSchema,
  changeSchema,
  payoutSchema,
  memberSchema,
} from './models'

function parse<T>(schema: z.ZodType<T>, response: { data: unknown; error: unknown }): T {
  if (response.error) throw new AppError('INTERNAL', 'Could not read affiliate records')
  return schema.parse(response.data)
}

export async function readAccount(user: string) {
  const result = await createAdminSupabase()
    .from('affiliates')
    .select(
      'slug,status,team_enabled,reject_reason,reapply_allowed,payout_method,payout_details,us_person,terms_version,terms_accepted_at',
    )
    .eq('user_id', user)
    .maybeSingle()
  return parse(accountSchema.nullable(), result)
}

export async function readSettings() {
  const result = await createAdminSupabase()
    .from('affiliate_settings')
    .select('hold_days,payout_min_usd,settlement_day,apply_min_level,terms_version')
    .single()
  return parse(settingsSchema, result)
}

const enrollmentSettings = settingsSchema.pick({ apply_min_level: true, terms_version: true })

// Read the live switch and the application settings together; a closed or unavailable program has no entry.
export async function readOpenEnrollmentSettings() {
  try {
    const { data, error } = await createAdminSupabase().from('affiliate_settings')
      .select('apply_min_level,terms_version').eq('singleton', true).eq('enabled', true).maybeSingle()
    if (!error) return enrollmentSettings.nullable().parse(data)
    logger.warn('affiliate enrollment settings unavailable', { code: error.code })
  } catch {
    logger.warn('affiliate enrollment settings unavailable')
  }
  return null
}

export async function canApply(user: string) {
  return parse(z.boolean(), await createAdminSupabase().rpc('affiliate_can_apply', { p_user: user }))
}

export async function readSummary(user: string) {
  return parse(summarySchema, await createAdminSupabase().rpc('affiliate_partner_summary', { p_user: user }))
}

export async function readCommissions(user: string, cursor?: string | null, teamOnly = false) {
  let q = createAdminSupabase()
    .from('affiliate_commissions')
    .select('id,created_at,product_id,base_usd,rate_bp,amount,status,confirm_after')
    .eq('affiliate_user_id', user)
  if (teamOnly) q = q.eq('level', 2)
  const after = decodeCursor(cursor)
  if (after) q = q.or(afterCursor(after))
  const result = await q
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(PAGE_SIZE + 1)
  return toPage(parse(commissionSchema.array(), result), (row) => row)
}

export async function readChanges(user: string, id: string, cursor?: string) {
  let q = createAdminSupabase()
    .from('affiliate_commission_changes')
    .select(
      'id,at,old_amount,new_amount,old_status,new_status,reason,affiliate_commissions!inner(affiliate_user_id)',
    )
    .eq('commission_id', id)
    .eq('affiliate_commissions.affiliate_user_id', user)
  const after = decodeCursor(cursor)
  if (after) q = q.or(afterCursor(after).replaceAll('created_at.', 'at.'))
  const result = await q
    .order('at', { ascending: false })
    .order('id', { ascending: false })
    .limit(PAGE_SIZE + 1)
  return toPage(
    parse(changeSchema.array(), result).map((row) => ({ ...row, created_at: row.at })),
    (row) => row,
  )
}

export async function readPayouts(user: string, cursor?: string) {
  let q = createAdminSupabase()
    .from('affiliate_payouts')
    .select('id,created_at,period,amount,paid_amount,status,paid_at')
    .eq('affiliate_user_id', user)
  const after = decodeCursor(cursor)
  if (after) q = q.or(afterCursor(after))
  const result = await q
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(PAGE_SIZE + 1)
  return toPage(parse(payoutSchema.array(), result), (row) => row)
}

export async function readMembers(user: string, cursor?: string) {
  let q = createAdminSupabase().from('affiliates').select('slug,created_at,status').eq('parent_user_id', user)
  const after = decodeCursor(cursor)
  if (after) q = q.or(afterCursor(after, 'slug'))
  const result = await q
    .order('created_at', { ascending: false })
    .order('slug', { ascending: false })
    .limit(PAGE_SIZE + 1)
  return toPage(
    parse(memberSchema.array(), result).map((row) => ({ ...row, id: row.slug })),
    (row) => row,
  )
}

type Referral = { mask: string; date: string; count: number; amount: number }
export async function readReferrals(user: string, cursor?: string): Promise<Page<Referral>> {
  const after = decodeCursor(cursor)
  const result = await createAdminSupabase().rpc('affiliate_partner_referrals', {
    p_user: user,
    p_before_at: after?.c ?? null,
    p_before_id: after?.i ?? null,
  })
  const rows = parse(referralSchema.array(), result).map((row) => ({
    ...row,
    id: row.masked_hash,
    created_at: row.referred_at,
  }))
  return toPage(rows, (row) => ({
    mask: row.masked_hash.slice(0, 6),
    date: row.referred_at,
    count: row.payment_count,
    amount: row.commission_amount,
  }))
}
