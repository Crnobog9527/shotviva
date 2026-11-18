import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

import { balanceRowSchema, readBalance } from '@/core/billing/balance'
import { FAVORITES_MAX, listFavoriteIdsOrEmpty } from '@/core/favorites'
import { logger } from '@/core/logger'

const createProfileRow = balanceRowSchema.extend({
  saved: z.array(z.object({ template_id: z.string() })),
})

// The balance and saved templates use the viewer's session and existing RLS.
export async function readCreatePersonalData(client: SupabaseClient, userId: string) {
  const { data, error } = await client.from('profiles')
    .select('credits, free_credits, saved:template_favorites(template_id, templates!inner())')
    .eq('id', userId)
    .eq('saved.templates.is_active', true)
    .contains('saved.templates.visible_in', ['web'])
    .order('created_at', { referencedTable: 'saved', ascending: false })
    .order('template_id', { referencedTable: 'saved', ascending: true })
    .limit(FAVORITES_MAX, { referencedTable: 'saved' })
    .maybeSingle()
  if (error) {
    logger.warn('create.combined_profile_read_failed', { code: error.code })
    // Check balance first so an outage does not trigger both fallback reads at once.
    const balance = await readBalance(client, userId)
    const favoriteIds = await listFavoriteIdsOrEmpty(client, userId)
    return { balance, favoriteIds }
  }
  if (data === null) return { balance: { paid: 0, free: 0 }, favoriteIds: [] }
  const row = createProfileRow.parse(data)
  return {
    balance: { paid: row.credits, free: row.free_credits },
    favoriteIds: row.saved.map(({ template_id }) => template_id),
  }
}
