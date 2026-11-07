import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import { AppError } from '../errors'
import { FAVORITES_MAX, favoriteTemplateIdSchema } from './rules'

// Every call takes the signed-in user's own session client (createServerSupabase): RLS keeps
// each account to its own rows, and the 0741 trigger checks the cap and the template.

type FavoriteRow = { template_id: string }

// The account's saved templates that are live on the web, newest first. The inner join drops
// rows whose template is unpublished (templates RLS) or partner-only (the visible_in filter);
// the rows stay, so a republished template comes back. Served by the primary key
// (user_id, template_id): at most FAVORITES_MAX rows, sorted after the scan.
export async function listFavoriteIds(client: SupabaseClient, userId: string): Promise<string[]> {
  const { data, error } = await client
    .from('template_favorites')
    .select('template_id, templates!inner(id)')
    .eq('user_id', userId)
    .eq('templates.is_active', true)
    .contains('templates.visible_in', ['web'])
    .order('created_at', { ascending: false })
    .order('template_id', { ascending: true })
    .limit(FAVORITES_MAX)
    .returns<FavoriteRow[]>()
  if (error) throw new AppError('INTERNAL', 'favorites read failed', { cause: error })
  return data.map((row) => row.template_id)
}

// Exception messages raised by the 0741 trigger.
function toFavoriteError(error: { message: string }): AppError {
  if (error.message === 'FAVORITES_LIMIT') return new AppError('FAVORITES_LIMIT', `Up to ${FAVORITES_MAX} saved templates`, { cause: error })
  if (error.message === 'TEMPLATE_NOT_FOUND') return new AppError('NOT_FOUND', 'That template is not available', { cause: error })
  return new AppError('INTERNAL', 'favorites write failed', { cause: error })
}

// Saves or removes one template; both are idempotent, so a repeated tap settles on the state
// asked for. One statement either way (AGENTS §5.1 item 1).
export async function setFavorite(client: SupabaseClient, userId: string, templateId: string, saved: boolean): Promise<{ saved: boolean }> {
  const id = favoriteTemplateIdSchema.safeParse(templateId)
  if (!id.success) throw new AppError('NOT_FOUND', 'That template is not available')
  const table = client.from('template_favorites')
  const { error } = saved
    ? await table.upsert({ user_id: userId, template_id: id.data }, { onConflict: 'user_id,template_id', ignoreDuplicates: true })
    : await table.delete().eq('user_id', userId).eq('template_id', id.data)
  if (error) throw toFavoriteError(error)
  return { saved }
}
