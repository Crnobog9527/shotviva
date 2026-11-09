import type { Metadata } from 'next'

import { isAffiliateEnabled } from '@/core/affiliate/feature'
import { AffiliateSwitchCard } from '@/core/affiliate/switch-card'
import { AdminPage, FEATURES_COPY, FeaturesEditor, listFeatureSettings, loadWishlistSwitch, type WishlistSwitchState } from '@/core/admin'
import { createAdminSupabase, requireAdmin } from '@/core/auth'
import { serverEnv } from '@/core/env'
import { previewOverride, siteHasWishlist } from '@/core/wishlist'
import { site } from '@/site/site.config'

import { saveAffiliateSwitchAction, saveFeatureAccessAction, saveWishlistSwitchAction } from './actions'

// Admin-only, request-time page (ARCHITECTURE §6.2 新功能抢先用, §10). The admin layout gates it too.
// The 需求墙 switch shows only on a site that has the wishlist at all (§15.6, T62).
export const instant = false

export const metadata: Metadata = { title: FEATURES_COPY.title }

async function wishlistState(db: ReturnType<typeof createAdminSupabase>): Promise<WishlistSwitchState> {
  if (!siteHasWishlist(site)) return null
  return { value: await loadWishlistSwitch(db), previewOverride: previewOverride(serverEnv()) }
}

export default async function AdminFeaturesPage() {
  await requireAdmin()
  const db = createAdminSupabase()
  const [settings, wishlist, affiliate] = await Promise.all([listFeatureSettings(db), wishlistState(db), isAffiliateEnabled()])
  return (
    <AdminPage title={FEATURES_COPY.title}>
      <AffiliateSwitchCard enabled={affiliate} save={saveAffiliateSwitchAction} />
      <FeaturesEditor
        settings={settings}
        wishlist={wishlist}
        actions={{ save: saveFeatureAccessAction, saveWishlist: saveWishlistSwitchAction }}
      />
    </AdminPage>
  )
}
