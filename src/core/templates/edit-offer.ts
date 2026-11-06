import type { SupabaseClient } from '@supabase/supabase-js'

import { EDIT_TEMPLATE_ID } from './edit-params'
import type { CreditsCost } from './pricing'

// Whether editing is on, and what an edit costs per tier (ARCHITECTURE §5.2). Read with the
// user's own session: templates_select_active lets anyone read a published row, and an
// unpublished `edit` row comes back as nothing, which hides the Edit button.
export async function loadEditOffer(client: SupabaseClient): Promise<{ creditsCost: CreditsCost } | null> {
  const { data, error } = await client
    .from('templates')
    .select('credits_cost')
    .eq('id', EDIT_TEMPLATE_ID)
    .eq('is_active', true)
    .maybeSingle<{ credits_cost: CreditsCost }>()
  if (error) throw new Error(`loadEditOffer failed: ${error.message}`)
  return data ? { creditsCost: data.credits_cost } : null
}
