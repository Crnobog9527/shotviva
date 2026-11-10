import 'server-only'

import { photoPrices } from '@/core/billing'
import type { PerkFacts } from '@/core/billing/paywall'
import { currentLocale } from '@/core/i18n/server'
import { cachedWebCatalogue } from '@/core/templates/cached-catalogue'
import { isWishlistEnabled } from '@/core/wishlist'
import { site } from '@/site/site.config'

// What every PaywallProvider is told about the plans: the wishlist switch (its vote perk) and
// the live Standard prices (the photo estimate). Both reads are cached, so the paywall stays in
// the prerendered shell of every page that mounts it.
export async function paywallPerkFacts(): Promise<PerkFacts> {
  const [wishlistLive, live] = await Promise.all([isWishlistEnabled(site), cachedWebCatalogue(await currentLocale())])
  return { wishlistLive, photoPrices: photoPrices(live) }
}
