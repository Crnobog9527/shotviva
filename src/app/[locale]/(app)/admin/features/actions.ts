'use server'

import { z } from 'zod'
import { refresh, updateTag } from 'next/cache'

import { runAdminAction, saveFeatureAccess, saveSettingSwitch, saveWishlistSwitch, WISHLIST_SWITCH_COPY, type ActionResult } from '@/core/admin'
import { AppError } from '@/core/errors'
import { createAdminSupabase, requireAdmin } from '@/core/auth'
import { FEATURES_CACHE_TAG } from '@/core/features'
import { SYSTEM_SETTINGS_CACHE_TAG } from '@/core/system-settings'

// Server actions are public endpoints, so each re-checks the admin role itself. A save expires
// its cache at once, so the change shows on the next request without a deploy (ARCHITECTURE
// §6.2, §15.6).
function featuresChanged() {
  updateTag(FEATURES_CACHE_TAG)
  refresh()
}

function settingsChanged() {
  updateTag(SYSTEM_SETTINGS_CACHE_TAG)
  refresh()
}

export async function saveFeatureAccessAction(input: unknown): Promise<ActionResult> {
  const admin = await requireAdmin()
  return runAdminAction(() => saveFeatureAccess({ db: createAdminSupabase(), invalidate: featuresChanged }, admin.id, input))
}

export async function saveWishlistSwitchAction(input: unknown): Promise<ActionResult> {
  const admin = await requireAdmin()
  return runAdminAction(() => saveWishlistSwitch({ db: createAdminSupabase(), invalidate: settingsChanged }, admin.id, input))
}

const GALLERY_KEYS = z.enum(['gallery_enabled', 'gallery_auto_approve'])

export async function saveGallerySwitchAction(key: unknown, input: unknown): Promise<ActionResult> {
  const admin = await requireAdmin()
  return runAdminAction(async () => {
    const parsedKey = GALLERY_KEYS.safeParse(key)
    if (!parsedKey.success) throw new AppError('INVALID_INPUT', WISHLIST_SWITCH_COPY.errors.invalid)
    await saveSettingSwitch({ db: createAdminSupabase(), invalidate: settingsChanged }, admin.id, parsedKey.data, input)
  })
}

export async function saveAffiliateSwitchAction(value: boolean): Promise<boolean> {
  const admin = await requireAdmin()
  const parsed = z.boolean().safeParse(value)
  if (!parsed.success) return false
  const { error } = await createAdminSupabase().rpc('admin_affiliate_settings', {
    p_actor: admin.id, p_input: { enabled: parsed.data },
  })
  if (error) return false
  refresh()
  return true
}
