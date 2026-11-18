import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

import { balanceRowSchema, readBalance } from '@/core/billing/balance'
import { FAVORITES_MAX, listFavoriteIdsOrEmpty } from '@/core/favorites'
import { listRunningJobIds, RUNNING_LIMIT } from '@/core/jobs/own-jobs'
import { RATE_LIMIT } from '@/core/jobs/rate-limit'
import { logger } from '@/core/logger'

const createProfileRow = balanceRowSchema.extend({
  running: z.array(z.object({ id: z.string() })),
  saved: z.array(z.object({ template_id: z.string() })),
})

// All three reads use the viewer's bearer token and existing RLS. Both lists use their
// user_id foreign key to the profile. Explicit joins avoid the second jobs FK (moderated_by).
// A missing profile has no lists, since their foreign keys require it to exist.
export async function readCreatePersonalData(client: SupabaseClient, userId: string, now: Date) {
  const since = new Date(now.getTime() - RATE_LIMIT.RUNNING_STALE_MS).toISOString()
  const { data, error } = await client.from('profiles')
    .select('credits, free_credits, running:generation_jobs!generation_jobs_user_id_fkey(id), saved:template_favorites(template_id, templates!inner())')
    .eq('id', userId)
    .eq('running.status', 'running')
    .is('running.deleted_at', null)
    .gt('running.created_at', since)
    .order('created_at', { referencedTable: 'running', ascending: false })
    .limit(RUNNING_LIMIT, { referencedTable: 'running' })
    .eq('saved.templates.is_active', true)
    .contains('saved.templates.visible_in', ['web'])
    .order('created_at', { referencedTable: 'saved', ascending: false })
    .order('template_id', { referencedTable: 'saved', ascending: true })
    .limit(FAVORITES_MAX, { referencedTable: 'saved' })
    .maybeSingle()
  if (error) {
    logger.warn('create.combined_profile_read_failed', { code: error.code })
    // Fall back to the original reads if the joined query fails. Check balance first, so
    // a database outage does not immediately trigger all three queries again.
    const balance = await readBalance(client, userId)
    const [runningIds, favoriteIds] = await Promise.all([
      listRunningJobIds(client, userId, now),
      listFavoriteIdsOrEmpty(client, userId),
    ])
    return { balance, runningIds, favoriteIds }
  }
  if (data === null) return { balance: { paid: 0, free: 0 }, runningIds: [], favoriteIds: [] }
  const row = createProfileRow.parse(data)
  return {
    balance: { paid: row.credits, free: row.free_credits },
    runningIds: row.running.map(({ id }) => id),
    favoriteIds: row.saved.map(({ template_id }) => template_id),
  }
}
