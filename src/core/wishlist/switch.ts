import type { SiteConfig } from '../config'
import type { ServerEnv } from '../env'
import { settingValue, type SystemSettingValues } from '../system-settings/registry'

export type SwitchEnv = Pick<ServerEnv, 'VERCEL_ENV' | 'FEATURE_WISHLIST_PREVIEW'>

// Whether this site has a wishlist at all; when it does not, there is no admin switch either.
export function siteHasWishlist(site: SiteConfig): boolean {
  return site.features.wishlist
}

// FEATURE_WISHLIST_PREVIEW=on opens the wishlist on a preview or local deployment so it can be
// validated without touching the admin switch. Production never reads it.
export function previewOverride(env: SwitchEnv): boolean {
  return env.VERCEL_ENV !== 'production' && env.FEATURE_WISHLIST_PREVIEW === 'on'
}

// The decision (ARCHITECTURE §15.6): the site has the feature at all, and either the admin
// switch or the preview override opens it. The settings are only read when the answer
// depends on them, so a site without the feature never touches the database.
export async function decideWishlist(
  site: SiteConfig,
  env: SwitchEnv,
  readSettings: () => Promise<SystemSettingValues>,
): Promise<boolean> {
  if (!siteHasWishlist(site)) return false
  if (previewOverride(env)) return true
  return settingValue(await readSettings(), 'wishlist_enabled')
}
