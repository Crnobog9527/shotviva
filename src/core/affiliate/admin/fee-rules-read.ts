import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { feeRuleSnapshot } from '../fees'
import { checked } from './read'

const adminFeeRule = feeRuleSnapshot.extend({
  active: z.boolean(),
  sort_order: z.number().int(),
  updated_at: z.string(),
})
export type AdminFeeRule = z.infer<typeof adminFeeRule>

// Configuration, like the rate table: a handful of rows, read whole (no pagination).
export async function feeRules(db: SupabaseClient) {
  const result = await db
    .from('affiliate_payout_fee_rules')
    .select('id,label_zh,label_en,kind,percent_bp,fixed_cents,min_cents,max_cents,payout_methods,effective_from,active,sort_order,updated_at')
    .eq('program', 'standard')
    .order('sort_order')
    .order('id')
    .limit(200)
  return adminFeeRule.array().parse(checked(result))
}
