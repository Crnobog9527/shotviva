import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { checked } from './read'

// Reads for the promotion credits tab (ARCHITECTURE §6.5 渠道商推广积分, tables of migration 1840).

const int = z.coerce.number().int()
const perCustomer = z.object({ customer: z.uuid(), raw: int, counted: int, capped: z.boolean() })
const source = z.object({ grant_id: int, period: z.string(), owed: int, applied: int })
const detail = z.object({
  per: z.array(perCustomer).default([]),
  sources: z.array(source).default([]),
  bonus_bp: int.default(0),
  customer_cap_bp: int.default(0),
  min_customers: int.default(0),
  window_start: z.string().optional(),
  window_end: z.string().optional(),
})
const sheet = z.object({
  id: z.coerce.string(),
  org_id: z.uuid(),
  period: z.string(),
  status: z.string(),
  recipient_user_id: z.uuid(),
  base: int,
  bonus: int,
  raw_credits: int,
  counted_credits: int,
  customer_cap: int,
  customers: int,
  capped_customers: int,
  clawback_owed: int,
  clawback_applied: int,
  total: int,
  detail,
  fingerprint: z.string(),
  computed_at: z.string(),
  expires_at: z.string(),
  decided_at: z.string().nullable(),
  decision_note: z.string().nullable(),
  expired_credits: int.nullable(),
  orgs: z.object({ name: z.string() }).nullable(),
})
export type PromoSheet = z.infer<typeof sheet>

const SHEET_COLUMNS =
  'id,org_id,period,status,recipient_user_id,base,bonus,raw_credits,counted_credits,customer_cap,customers,capped_customers,' +
  'clawback_owed,clawback_applied,total,detail,fingerprint,computed_at,expires_at,decided_at,decision_note,expired_credits,orgs(name)'

/** The latest sheets, newest month first (partner_promo_grants_list_idx); two partners × a year fits. */
export async function promoSheets(db: SupabaseClient, limit = 30): Promise<PromoSheet[]> {
  const rows = checked(
    await db.from('partner_promo_grants').select(SHEET_COLUMNS).order('period', { ascending: false }).order('id', { ascending: false }).limit(limit),
  )
  return z.array(sheet).parse(rows)
}

/** Sheets waiting for a decision whose month is not over (partner_promo_grants_pending_idx): the badge. */
export async function pendingPromoCount(db: SupabaseClient, now = new Date()): Promise<number> {
  const answer = await db
    .from('partner_promo_grants')
    .select('id', { count: 'exact' })
    .eq('status', 'pending')
    .gt('expires_at', now.toISOString())
    .limit(1)
  checked(answer)
  return answer.count ?? 0
}

const partnerRow = z.object({ id: z.uuid(), name: z.string(), status: z.string(), promo_partner: z.boolean(), owner_user_id: z.uuid() })
export type PromoPartner = z.infer<typeof partnerRow>

/** Orgs with their affiliate switch on (the only ones that can be partners); a handful of rows. */
export async function promoPartners(db: SupabaseClient): Promise<PromoPartner[]> {
  const rows = checked(
    await db.from('orgs').select('id,name,status,promo_partner,owner_user_id').eq('affiliate_enabled', true).order('created_at').limit(200),
  )
  return z.array(partnerRow).parse(rows)
}
