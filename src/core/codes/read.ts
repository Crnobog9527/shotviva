import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

const terms = z.object({
  code: z.string(), discount_percent: z.number().nullable(), discount_products: z.array(z.string()).nullable(),
  discount_duration: z.enum(['once', 'repeating', 'forever']).nullable(), discount_months: z.number().nullable(),
  starts_at: z.string().nullable(), expires_at: z.string().nullable(), active: z.boolean(),
})

function available(offer: z.infer<typeof terms>, now: number) {
  return offer.active && (!offer.starts_at || Date.parse(offer.starts_at) <= now)
    && (!offer.expires_at || Date.parse(offer.expires_at) > now)
}

const preview = terms.extend({
  kind: z.enum(['invite', 'campaign']), code_preview_credits: z.number().int().nonnegative(), invitee_pool: z.enum(['free', 'paid']).nullable(),
  max_redemptions: z.number().nullable(), redemption_count: z.number(),
  owner: z.object({ banned_at: z.string().nullable() }).nullable(),
})

export async function previewCode(admin: SupabaseClient, code: string) {
  const { data, error } = await admin.from('codes')
    .select('code,kind,active,starts_at,expires_at,max_redemptions,redemption_count,code_preview_credits,invitee_pool,discount_percent,discount_products,discount_duration,discount_months,owner:profiles!codes_owner_user_id_fkey(banned_at)')
    .eq('code', code).maybeSingle()
  if (error) throw error
  if (!data) return null
  const c = preview.parse(data)
  if (!available(c, Date.now()) || c.owner?.banned_at || (c.max_redemptions !== null && c.redemption_count >= c.max_redemptions)) return null
  return describeOffer(c)
}

function describeOffer(c: z.infer<typeof preview>) {
  return { kind: c.kind, credits: c.code_preview_credits,
    pool: c.kind === 'invite' ? 'free' as const : c.invitee_pool, percent: c.discount_percent, products: c.discount_products ?? [],
    duration: c.discount_duration, months: c.discount_months }
}

export async function readPendingDiscount(admin: SupabaseClient, userId: string) {
  const { data, error } = await admin.from('code_redemptions')
    .select('discount_expires_at,codes!inner(code,discount_percent,discount_products,discount_duration,discount_months,starts_at,expires_at,active)')
    .eq('user_id', userId).eq('status', 'ok').is('discount_used_payment_id', null).is('discount_void_at', null)
    .not('codes.discount_percent', 'is', null).maybeSingle()
  if (error) throw error
  if (!data) return null
  const row = z.object({ discount_expires_at: z.string().nullable(), codes: terms }).parse(data)
  const c = row.codes
  const until = [row.discount_expires_at, c.expires_at].filter((s): s is string => s !== null)
    .sort((a, b) => Date.parse(a) - Date.parse(b))[0] ?? null
  const now = Date.now()
  if (!available(c, now) || !c.discount_percent || !c.discount_duration || (until && Date.parse(until) <= now)) return null
  return { code: c.code, percent: c.discount_percent, products: c.discount_products ?? [], duration: c.discount_duration,
    months: c.discount_months, expiresAt: until }
}
