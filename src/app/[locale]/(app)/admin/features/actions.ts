'use server'

import { z } from 'zod'
import { refresh, updateTag } from 'next/cache'

import { runAdminAction, saveFeatureAccess, setFeatureInvite, saveSettingSwitch, saveSignupGiftRules, saveWishlistSwitch, WISHLIST_SWITCH_COPY, type ActionResult } from '@/core/admin'
import { AppError } from '@/core/errors'
import { createAdminSupabase, requireAdmin } from '@/core/auth'
import { FEATURES_CACHE_TAG } from '@/core/features'
import { GALLERY_SWITCH_TAG } from '@/core/gallery'
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

// An invite changes who passes requireFeature on the very next request (it is never cached).
export async function setFeatureInviteAction(input: unknown): Promise<ActionResult> {
  const admin = await requireAdmin()
  return runAdminAction(async () => {
    await setFeatureInvite({ db: createAdminSupabase() }, admin.id, input)
    refresh()
  })
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
    const invalidate = () => {
      updateTag(GALLERY_SWITCH_TAG)
      settingsChanged()
    }
    await saveSettingSwitch({ db: createAdminSupabase(), invalidate }, admin.id, parsedKey.data, input)
  })
}

// 1350 + 1480: the signup gift's pause and rules. grant_credits and claim_signup_gift read the
// rows themselves; the page reads again so today's count shows the new cap.
export async function saveSignupGiftPausedAction(input: unknown): Promise<ActionResult> {
  const admin = await requireAdmin()
  return runAdminAction(() => saveSettingSwitch({ db: createAdminSupabase(), invalidate: settingsChanged }, admin.id, 'signup_gift_paused', input))
}

export async function saveSignupGiftRulesAction(input: unknown): Promise<ActionResult> {
  const admin = await requireAdmin()
  const result = await runAdminAction(() => saveSignupGiftRules({ db: createAdminSupabase(), invalidate: settingsChanged }, admin.id, input))
  if (result.ok) refresh()
  return result
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
