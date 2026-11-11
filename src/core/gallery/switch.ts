import type { SiteConfig } from '../config'
import { settingValue, type SystemSettingValues } from '../system-settings/registry'

// Whether this site has a public gallery at all; when it does not, there is no admin switch either.
export function siteHasGallery(site: SiteConfig): boolean {
  return site.gallery.enabled
}

// The decision (ARCHITECTURE §9 第 1 条): the site has a gallery and the admin switch opens it.
// There is no preview override: the test site has its own database, so its admin opens its own
// gallery. The settings are only read when the answer depends on them.
export async function decideGallery(site: SiteConfig, readSettings: () => Promise<SystemSettingValues>): Promise<boolean> {
  if (!siteHasGallery(site)) return false
  return settingValue(await readSettings(), 'gallery_enabled')
}
