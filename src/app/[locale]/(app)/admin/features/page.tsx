import type { Metadata } from 'next'

import {
  AdminPage,
  ChildCard,
  FEATURES_COPY,
  FeatureGates,
  FeatureSection,
  FeaturesOverview,
  FoodTogglesCard,
  SiteSwitches,
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
import { isAffiliateEnabled } from '@/core/affiliate/feature'
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
// Sections in the order the Owner touches them most, an overview of every switch on top
// (Owner 2026-11-27). The affiliate switch lives on 联盟营销; the overview links there.
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

// The dense-text poster gate sits with the poster's other setting under 出图功能.
const POSTER_FEATURE = 'dense_poster'
const S = FEATURES_COPY.sections

export default async function AdminFeaturesPage() {
  await requireAdmin()
  const db = createAdminSupabase()
  const [settings, wishlist, gallery, signupGift, photoPrice, foodToggles, serviceWorker, appShell, affiliate] = await Promise.all([
    listFeatureSettings(db), wishlistState(db), galleryState(db), loadSignupGift(db), loadPosterPhotoPrice(db),
    loadSettingSwitch(db, 'food_toggles_enabled'), loadSettingSwitch(db, 'service_worker_enabled'), loadSettingSwitch(db, 'service_worker_shell_enabled'),
    isAffiliateEnabled(),
  ])
  const posterGates = settings.filter((setting) => setting.key === POSTER_FEATURE)
  const otherGates = settings.filter((setting) => setting.key !== POSTER_FEATURE)
  const gateActions = { save: saveFeatureAccessAction, invite: setFeatureInviteAction }
  return (
    <AdminPage title={FEATURES_COPY.title}>
      <FeaturesOverview
        input={{
          signupPaused: signupGift.paused, food: foodToggles, posterGate: posterGates[0] ?? null, photoCredits: photoPrice,
          wishlist: wishlist?.value ?? null, gallery, serviceWorker, appShell, affiliate,
        }}
      />
      <FeatureSection id="signup" {...S.signup}>
        <SignupGiftCard state={signupGift} savePaused={saveSignupGiftPausedAction} saveRules={saveSignupGiftRulesAction} />
      </FeatureSection>
      <FeatureSection id="generation" {...S.generation}>
        <FoodTogglesCard value={foodToggles} save={saveFoodTogglesAction} />
        <FeatureGates settings={posterGates} {...gateActions} />
        <PosterPhotoCard credits={photoPrice} save={savePosterPhotoPriceAction} />
      </FeatureSection>
      {wishlist || gallery ? (
        <FeatureSection id="site" {...S.site}>
          <SiteSwitches wishlist={wishlist} gallery={gallery} saveWishlist={saveWishlistSwitchAction} saveGallery={saveGallerySwitchAction} />
        </FeatureSection>
      ) : null}
      <FeatureSection id="speed" {...S.speed}>
        <ServiceWorkerCard value={serviceWorker} save={saveServiceWorkerAction} />
        <ChildCard>
          <AppShellCard value={appShell} workerOn={serviceWorker.enabled} save={saveAppShellAction} />
        </ChildCard>
      </FeatureSection>
      <FeatureSection id="early" {...S.early}>
        <FeatureGates settings={otherGates} {...gateActions} empty />
      </FeatureSection>
    </AdminPage>
  )
}
