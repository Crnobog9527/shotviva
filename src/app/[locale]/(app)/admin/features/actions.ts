'use server'

import { z } from 'zod'
import { refresh, updateTag } from 'next/cache'

import { runAdminAction, saveFeatureAccess, setFeatureInvite, savePosterPhotoPrice, saveSettingSwitch, saveSignupGiftRules, saveSignupLimits, saveWishlistSwitch, WISHLIST_SWITCH_COPY, type ActionResult } from '@/core/admin'
import { AppError } from '@/core/errors'
import { createAdminSupabase, requireAdmin } from '@/core/auth'
import { FEATURES_CACHE_TAG } from '@/core/features'
import { GALLERY_SWITCH_TAG } from '@/core/gallery'
import { FOOD_TOGGLES_SWITCH_TAG, SERVICE_WORKER_SWITCH_TAG, SYSTEM_SETTINGS_CACHE_TAG, type FoodSwitchKey } from '@/core/system-settings'
import { warmPublicPagesSoon } from '@/app/warm-public-pages'

// Server actions are public endpoints, so each re-checks the admin role itself. A save expires
// its cache at once, so the change shows on the next request without a deploy (ARCHITECTURE
// §6.2, §15.6).
function featuresChanged() {
  updateTag(FEATURES_CACHE_TAG)
  warmPublicPagesSoon()
  refresh()
}

function settingsChanged() {
  updateTag(SYSTEM_SETTINGS_CACHE_TAG)
  warmPublicPagesSoon()
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

// 2027: the per-IP sign-up and SMS limits. signup_request and the SMS functions read the rows
// themselves; the page reads again so the card shows what is stored.
export async function saveSignupLimitsAction(input: unknown): Promise<ActionResult> {
  const admin = await requireAdmin()
  const result = await runAdminAction(() => saveSignupLimits({ db: createAdminSupabase(), invalidate: settingsChanged }, admin.id, input))
  if (result.ok) refresh()
  return result
}

// 1521: 拍照识别's price; the editor reads it through the system-settings cache.
export async function savePosterPhotoPriceAction(input: unknown): Promise<ActionResult> {
  const admin = await requireAdmin()
  return runAdminAction(() => savePosterPhotoPrice({ db: createAdminSupabase(), invalidate: settingsChanged }, admin.id, input))
}

// 2009: 优化摆盘 and 优化器皿 site-wide, one switch each. The root layout, /api/generate and test
// runs read both through their own tag.
async function saveFoodSwitch(key: FoodSwitchKey, input: unknown): Promise<ActionResult> {
  const admin = await requireAdmin()
  const invalidate = () => {
    updateTag(FOOD_TOGGLES_SWITCH_TAG)
    settingsChanged()
  }
  return runAdminAction(() => saveSettingSwitch({ db: createAdminSupabase(), invalidate }, admin.id, key, input))
}

export async function saveFoodPlatingAction(input: unknown): Promise<ActionResult> {
  return saveFoodSwitch('food_plating_enabled', input)
}

export async function saveFoodTablewareAction(input: unknown): Promise<ActionResult> {
  return saveFoodSwitch('food_tableware_enabled', input)
}

// 1999: the home-screen app's service worker, and its kill switch. The root layout and /sw.js read
// it through its own tag.
export async function saveServiceWorkerAction(input: unknown): Promise<ActionResult> {
  const admin = await requireAdmin()
  const invalidate = () => {
    updateTag(SERVICE_WORKER_SWITCH_TAG)
    settingsChanged()
  }
  return runAdminAction(() => saveSettingSwitch({ db: createAdminSupabase(), invalidate }, admin.id, 'service_worker_enabled', input))
}

// 2001: Create's app shell (ARCHITECTURE §18.3). /sw.js reads it through the same tag.
export async function saveAppShellAction(input: unknown): Promise<ActionResult> {
  const admin = await requireAdmin()
  const invalidate = () => {
    updateTag(SERVICE_WORKER_SWITCH_TAG)
    settingsChanged()
  }
  return runAdminAction(() => saveSettingSwitch({ db: createAdminSupabase(), invalidate }, admin.id, 'service_worker_shell_enabled', input))
}
