import { unstable_rethrow } from 'next/navigation'
import { Suspense } from 'react'

import { googleAction } from '@/app/auth/actions'
import { createAdminSupabase, createServerSupabase, getSessionUser } from '@/core/auth'
import { currentTier, limitsFor, readBalance } from '@/core/billing'
import { PaywallProvider } from '@/core/billing/paywall'
import { wechatPayEnabled } from '@/core/billing/stripe'
import { StandingSlot } from '@/core/billing/standing'
import { paymentChannel } from '@/core/billing/waffo'
import { listFavoriteIdsOrEmpty } from '@/core/favorites'
import { listOwnJobs } from '@/core/jobs'
import { logger } from '@/core/logger'
import { isWishlistEnabled } from '@/core/wishlist'
import { HomeGenerator, type HomeGeneratorProps, type HomeViewer } from '@/modules/image/marketing'
import { site } from '@/site/site.config'

type Base = Omit<HomeGeneratorProps, 'viewer' | 'googleAction'>

// The visitor half of the home generator: the only request-time read on the page. Everything
// else (copy, templates, samples) is in the prerendered shell (建站规格 R5).
async function viewerOf(): Promise<HomeViewer | null> {
  const user = await getSessionUser()
  if (!user?.verified) return null
  const supabase = await createServerSupabase()
  const [balance, tier, own, favoriteIds] = await Promise.all([
    readBalance(supabase, user.id),
    // current_tier() is service-role only; the user's own id comes from the session.
    currentTier(createAdminSupabase(), user.id),
    listOwnJobs(supabase, user.id, new Date()),
    // A failed read degrades to no favorites (logged), never to an error page or signed-out home.
    listFavoriteIdsOrEmpty(supabase, user.id),
  ])
  return { balance, concurrency: { limit: limitsFor(tier).concurrency, runningIds: own.running.map((job) => job.id) }, favoriteIds }
}

// The home page is everyone's first page: an auth or database hiccup shows the signed-out
// generator instead of an error page.
async function safeViewer(): Promise<HomeViewer | null> {
  try {
    return await viewerOf()
  } catch (error) {
    // Next's own control flow (prerender bail-outs, redirects) must pass through.
    unstable_rethrow(error)
    logger.error('home.viewer_read_failed', { error })
    return null
  }
}

async function WithViewer(props: Base) {
  const [viewer, wishlistLive] = await Promise.all([safeViewer(), isWishlistEnabled(site)])
  if (!viewer) return <HomeGenerator {...props} viewer={null} googleAction={googleAction} />
  // "Get credits · N needed" opens the same paywall as the workspace (DESIGN §6.9 item 9).
  return (
    <PaywallProvider products={site.billing.products} wishlistLive={wishlistLive} channel={paymentChannel()} wechatPay={wechatPayEnabled()}>
      <HomeGenerator {...props} viewer={viewer} googleAction={googleAction} />
      {/* What the member holds, so the paywall locks lower plans (T66). */}
      <StandingSlot />
    </PaywallProvider>
  )
}

// While the session streams in, the generator shows as for a signed-out visitor.
export function HomeGeneratorSlot(props: Base) {
  return (
    <Suspense fallback={<HomeGenerator {...props} viewer={null} googleAction={googleAction} />}>
      <WithViewer {...props} />
    </Suspense>
  )
}
