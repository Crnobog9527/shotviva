import type { Metadata } from 'next'

import {
  AdminPage,
  FEATURES_COPY,
  FeaturesEditor,
  FoodTogglesCard,
  AppShellCard,
  ServiceWorkerCard,
  listFeatureSettings,
  loadPosterPhotoPrice,
  loadSettingSwitch,
  loadSignupGift,
  loadWishlistSwitch,
  PosterPhotoCard,
  SignupGiftCard,
  type GallerySwitchState,
  type WishlistSwitchState,
} from '@/core/admin'
import { createAdminSupabase, requireAdmin } from '@/core/auth'
import { serverEnv } from '@/core/env'
import { siteHasGallery } from '@/core/gallery'
import { previewOverride, siteHasWishlist } from '@/core/wishlist'
import { site } from '@/site/site.config'

import {
  saveFeatureAccessAction,
  saveFoodTogglesAction,
  saveAppShellAction,
  saveServiceWorkerAction,
  setFeatureInviteAction,
  saveGallerySwitchAction,
  saveSignupGiftPausedAction,
  savePosterPhotoPriceAction,
  saveSignupGiftRulesAction,
  saveWishlistSwitchAction,
} from './actions'

// Admin-only, request-time page (ARCHITECTURE §6.2 新功能抢先用, §10). The admin layout gates it too.
// The 需求墙 and gallery switches show only on a site that has the feature at all (§15.6, §9).
export const instant = false

export const metadata: Metadata = { title: FEATURES_COPY.title }

async function wishlistState(db: ReturnType<typeof createAdminSupabase>): Promise<WishlistSwitchState> {
  if (!siteHasWishlist(site)) return null
  return { value: await loadWishlistSwitch(db), previewOverride: previewOverride(serverEnv()) }
}

async function galleryState(db: ReturnType<typeof createAdminSupabase>): Promise<GallerySwitchState> {
  if (!siteHasGallery(site)) return null
  const [enabled, autoApprove] = await Promise.all([loadSettingSwitch(db, 'gallery_enabled'), loadSettingSwitch(db, 'gallery_auto_approve')])
  return { enabled, autoApprove }
}

export default async function AdminFeaturesPage() {
  await requireAdmin()
  const db = createAdminSupabase()
  const [settings, wishlist, gallery, signupGift, photoPrice, foodToggles, serviceWorker, appShell] = await Promise.all([
    listFeatureSettings(db), wishlistState(db), galleryState(db), loadSignupGift(db), loadPosterPhotoPrice(db),
    loadSettingSwitch(db, 'food_toggles_enabled'), loadSettingSwitch(db, 'service_worker_enabled'), loadSettingSwitch(db, 'service_worker_shell_enabled'),
  ])
  return (
    <AdminPage title={FEATURES_COPY.title}>
      <div className="mb-6 grid gap-4">
        <SignupGiftCard state={signupGift} savePaused={saveSignupGiftPausedAction} saveRules={saveSignupGiftRulesAction} />
        <PosterPhotoCard credits={photoPrice} save={savePosterPhotoPriceAction} />
        <FoodTogglesCard value={foodToggles} save={saveFoodTogglesAction} />
        <ServiceWorkerCard value={serviceWorker} save={saveServiceWorkerAction} />
        <AppShellCard value={appShell} save={saveAppShellAction} />
      </div>
      <FeaturesEditor
        settings={settings}
        wishlist={wishlist}
        gallery={gallery}
        actions={{ save: saveFeatureAccessAction, invite: setFeatureInviteAction, saveWishlist: saveWishlistSwitchAction, saveGallery: saveGallerySwitchAction }}
      />
    </AdminPage>
  )
}
