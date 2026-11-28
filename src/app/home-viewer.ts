import 'server-only'

import { createAdminSupabase, createServerSupabase } from '@/core/auth'
import { batchLimitsOf, effectiveLimits, photoPrices, readBalance } from '@/core/billing'
import { readMemberStanding } from '@/core/billing/standing'
import type { MemberStanding } from '@/core/billing/subscription/standing'
import { walletOffersWechat } from '@/core/billing/wallet'
import { paymentChannel } from '@/core/billing/waffo'
import { listFavoriteIdsOrEmpty } from '@/core/favorites'
import type { Locale } from '@/core/i18n'
import { listRunningJobIds } from '@/core/jobs'
import { logger } from '@/core/logger'
import { readPoolChoiceOffer, spendableBalance } from '@/core/org'
import { cachedWebCatalogue } from '@/core/templates/cached-catalogue'
import { isWishlistEnabled } from '@/core/wishlist'
import type { HomeViewer } from '@/modules/image/marketing'
import { displayProducts } from '@/site/billing/display-products'
import { site } from '@/site/site.config'

import type { HomePaywall } from './home-member'

// The visitor half of the home generator, for a signed-in, verified account: what the form needs
// to read as Create's does. Asked for by the browser (GET /api/home/viewer), never by the page, so
// the home and landing pages prerender fully static.
export async function readHomeViewer(userId: string): Promise<HomeViewer> {
  const supabase = await createServerSupabase()
  const admin = createAdminSupabase()
  const [balance, limits, runningIds, favoriteIds, poolChoice] = await Promise.all([
    readBalance(supabase, userId).then((own) => spendableBalance(admin, userId, own)),
    // effective_limits() (tier, an unbanned admin as Max, plus the org lift) is service-role only; the user's own id comes from the session.
    effectiveLimits(admin, userId),
    listRunningJobIds(admin, userId, new Date()),
    // A failed read degrades to no favorites (logged), never to an error page or signed-out home.
    listFavoriteIdsOrEmpty(supabase, userId),
    // 出图时让员工自选 (§6.5), as Create reads it: the template panel's form takes it.
    readPoolChoiceOffer(admin, userId),
  ])
  return { balance, concurrency: { limit: limits.concurrency, runningIds }, favoriteIds, tier: limits.tier, batch: batchLimitsOf(limits), poolChoice }
}

// What the member holds, so the paywall locks lower plans (T66). Fail-soft, as StandingSlot is:
// nothing sent, the cards read as for a new buyer, and checkout still refuses (409).
export async function readHomeStanding(userId: string): Promise<MemberStanding | null> {
  try {
    return await readMemberStanding(userId)
  } catch (error) {
    logger.error('paywall.standing_read_failed', { error })
    return null
  }
}

// "Get credits · N needed" opens the same paywall as the workspace (DESIGN §6.9 item 9): what its
// provider is told. Cached reads, the same for every visitor in a language.
export async function readHomePaywall(locale: Locale): Promise<HomePaywall> {
  const [wishlistLive, live, products] = await Promise.all([isWishlistEnabled(site), cachedWebCatalogue(locale), displayProducts()])
  return { products, perkFacts: { wishlistLive, photoPrices: photoPrices(live) }, channel: paymentChannel(), wechatPay: walletOffersWechat() }
}
