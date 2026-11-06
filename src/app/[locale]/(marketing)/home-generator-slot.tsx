import { unstable_rethrow } from 'next/navigation'
import { Suspense } from 'react'

import { googleAction } from '@/app/auth/actions'
import { createAdminSupabase, createServerSupabase, getSessionUser } from '@/core/auth'
import { currentTier, limitsFor, readBalance } from '@/core/billing'
import { PaywallProvider } from '@/core/billing/paywall'
import { paymentChannel } from '@/core/billing/waffo'
import { listOwnJobs } from '@/core/jobs'
import { logger } from '@/core/logger'
import { isWishlistEnabled } from '@/core/wishlist'
import { HomeGenerator, type HomeGeneratorProps, type HomeViewer } from '@/modules/image'
import { site } from '@/site/site.config'

type Base = Omit<HomeGeneratorProps, 'viewer' | 'googleAction'>

// The visitor half of the home generator: the only request-time read on the page. Everything
// else (copy, templates, samples) is in the prerendered shell (建站规格 R5).
async function viewerOf(): Promise<HomeViewer | null> {
  const user = await getSessionUser()
  if (!user?.emailVerified) return null
  const supabase = await createServerSupabase()
  const [balance, tier, own] = await Promise.all([
    readBalance(supabase, user.id),
    // current_tier() is service-role only; the user's own id comes from the session.
    currentTier(createAdminSupabase(), user.id),
    listOwnJobs(supabase, user.id, new Date()),
  ])
  return { balance, concurrency: { limit: limitsFor(tier).concurrency, runningIds: own.running.map((job) => job.id) } }
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
  const viewer = await safeViewer()
  if (!viewer) return <HomeGenerator {...props} viewer={null} googleAction={googleAction} />
  // "Get credits · N needed" opens the same paywall as the workspace (DESIGN §6.9 item 9).
  return (
    <PaywallProvider products={site.billing.products} wishlistLive={isWishlistEnabled(site)} channel={paymentChannel()}>
      <HomeGenerator {...props} viewer={viewer} googleAction={googleAction} />
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
