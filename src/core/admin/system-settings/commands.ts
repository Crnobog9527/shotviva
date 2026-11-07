import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

import { callRpc, type RpcClient } from '@/core/billing'
import { AppError } from '@/core/errors'
import { logger } from '@/core/logger'
import { settingValue } from '@/core/system-settings'

import { WISHLIST_SWITCH_COPY } from '../features-editor/wishlist-copy'
import type { WishlistSwitch } from './types'

// The 需求墙 switch on /admin/features (ARCHITECTURE §15.6, T62). Service-role client only:
// system_settings refuses every client role. The page reads the table, not the cache, so it
// always shows what was last saved.

const rowSchema = z.object({ value: z.unknown(), updated_at: z.string(), updated_by: z.string().nullable() })

export async function loadWishlistSwitch(db: SupabaseClient): Promise<WishlistSwitch> {
  const { data, error } = await db
    .from('system_settings')
    .select('value, updated_at, updated_by')
    .eq('key', 'wishlist_enabled')
    .maybeSingle()
  if (error) throw new AppError('INTERNAL', 'system_settings read failed', { cause: new Error(error.message) })
  if (!data) return { enabled: false, updatedAt: null, updatedByEmail: null }
  const row = rowSchema.parse(data)
  return {
    enabled: settingValue({ wishlist_enabled: row.value }, 'wishlist_enabled'),
    updatedAt: row.updated_at,
    updatedByEmail: row.updated_by ? await emailOf(db, row.updated_by) : null,
  }
}

// Who saved it last, for the card only: a lookup failure leaves the name out.
async function emailOf(db: SupabaseClient, id: string): Promise<string | null> {
  const { data, error } = await db.auth.admin.getUserById(id)
  if (error) logger.warn('admin.system_settings.actor_lookup_failed', { error })
  return data.user?.email ?? null
}

export const saveWishlistSwitchSchema = z.object({ enabled: z.boolean() })

export type SystemSettingDeps = {
  db: RpcClient
  // Expires the system-settings cache tag; the server action passes updateTag + refresh.
  invalidate: () => void
}

// One RPC (admin_set_system_setting checks the admin role, the key and the type again), then
// the cache: a failed write leaves the cached switch as it was.
export async function saveWishlistSwitch(deps: SystemSettingDeps, adminId: string, input: unknown): Promise<void> {
  const parsed = saveWishlistSwitchSchema.safeParse(input)
  if (!parsed.success) throw new AppError('INVALID_INPUT', WISHLIST_SWITCH_COPY.errors.invalid)
  const { enabled } = parsed.data
  await callRpc(
    deps.db,
    'admin_set_system_setting',
    { p_key: 'wishlist_enabled', p_value: enabled, p_actor: adminId },
    z.unknown(),
  )
  deps.invalidate()
  logger.info('admin.system_settings.saved', { adminId, key: 'wishlist_enabled', enabled })
}
