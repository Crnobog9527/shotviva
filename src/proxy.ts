import createMiddleware from 'next-intl/middleware'
import type { NextRequest } from 'next/server'

import { isAffiliateEnabled, requiresAffiliateProgram } from '@/core/affiliate/feature'
import { notFoundResponse } from '@/core/auth/proxy-gates'
import { recordReferral } from '@/core/affiliate/referral'
import { withAnalyticsRegion } from '@/core/analytics/consent'
import { proxyGate, type Forward } from '@/core/auth/proxy'
import { captureCodeLink } from '@/core/codes/link'
import { isBadGalleryPage } from '@/core/gallery/page-number'
import { galleryWorkIdOf, liveGalleryGate } from '@/core/gallery/proxy-gate'
import { serverEnv } from '@/core/env'
import { experimentRoute, OPTION_PAGES, rewrittenRequest, withExperimentCookie, type RouteOutcome } from '@/core/experiments/server'
import { viaImageCdn } from '@/core/storage/image-cdn-guard'
import { routing } from '@/core/i18n/routing'
import { canonicalRedirectResponse, withHostNoindex } from '@/core/seo'
import { experimentRegistry } from '@/site/experiments/registry'
import { site } from '@/site/site.config'

const hosts = { canonicalHost: site.brand.domain, redirectHosts: site.indexing.canonicalRedirectHosts }
// One per proxy instance: it holds the gallery switch for a few seconds (core/gallery/proxy-gate.ts).
const isShownWork = liveGalleryGate(site)

// next-intl's router: /pricing is served from app/[locale] as `en`, /zh/pricing as `zh`, and
// /en/pricing redirects to /pricing. It never redirects by browser language (ARCHITECTURE §17).
const localeRouter = createMiddleware(routing)

// Production's vercel.app host 308s to the real domain once it is configured (ARCHITECTURE
// §12.0). Then the Supabase session is refreshed and /admin (404), signed-in pages (307 to the
// login page of the same language) and /zh addresses of English-only pages (the Chinese 404)
// answer with real statuses before rendering; pages still call requireUser()/requireAdmin().
// Every response gets X-Robots-Tag while indexing is closed or off-domain, and the analytics
// region cookie (T70).
// Pages and APIs never answer through the image CDN (core/storage/image-cdn-guard.ts); then the
// canonical-host redirect.
function earlyResponse(request: NextRequest) {
  return viaImageCdn(request.headers) ? notFoundResponse() : canonicalRedirectResponse(request, hosts)
}

// /gallery?page= outside 1–20 (T108): a real 404 here, since the page reads the number inside a
// Suspense boundary, after its status is sent. The experiments' prerendered option pages
// (ARCHITECTURE §16.5) are reached only through the rewrite in experimentForward.
function closedAddress(request: NextRequest): boolean {
  return isBadGalleryPage(request.nextUrl) || OPTION_PAGES.test(request.nextUrl.pathname)
}

// The locale router, handed the A/B option's page instead of the address when there is one.
function experimentForward(experiment: RouteOutcome | null): Forward {
  const rewrite = experiment?.rewrite
  return rewrite ? (forwarded) => localeRouter(rewrittenRequest(forwarded, rewrite)) : localeRouter
}

export async function proxy(request: NextRequest) {
  const early = earlyResponse(request)
  if (early) return early
  if (/^\/admin-media\/(references|prompt-lab)\//.test(request.nextUrl.pathname)) {
    const { referenceMedia } = await import('@/core/admin/reference-library/media-proxy')
    return referenceMedia(request)
  }
  if (requiresAffiliateProgram(request.nextUrl.pathname) && !(await isAffiliateEnabled())) {
    return notFoundResponse()
  }
  if (closedAddress(request)) return notFoundResponse()
  // /g/<id> (T108): a real 404 unless the gallery is open and shows the work.
  const workId = galleryWorkIdOf(request.nextUrl.pathname)
  if (workId !== null && !(workId && (await isShownWork(workId)))) return notFoundResponse()
  const env = serverEnv()
  // A/B experiments (ARCHITECTURE §16.5): on a surface's address, which option page answers. The
  // page itself stays prerendered; only this rewrite and the cookie differ per visitor.
  const experiment = await experimentRoute(request, experimentRegistry, env.VERCEL_ENV !== 'production')
  const response = captureCodeLink(request) ?? await proxyGate(request, {
    translatedPaths: site.locales.zhPaths,
    forward: experimentForward(experiment),
    // /generate/upload-test only under `next dev`.
    devPages: env.NODE_ENV === 'development',
    // /error-test, the error-boundary check, on local builds and the test site only.
    validationPages: env.VERCEL_ENV !== 'production',
    // Seals the proxy's session check for the page, so the page does not repeat it (ARCHITECTURE §7).
    identitySecret: env.SUPABASE_SERVICE_ROLE_KEY,
  })
  // Whether analytics may use cookies for this visitor (ARCHITECTURE §16.1, T70); the test
  // site and local dev accept ?sv_country=XX to act as a visitor from that country.
  withAnalyticsRegion(response, request, { testOverride: env.VERCEL_ENV !== 'production' })
  withExperimentCookie(response, experiment, request.nextUrl.protocol === 'https:')
  await recordReferral(request, response)
  return withHostNoindex(response, request, hosts.canonicalHost)
}

// /ingest is the PostHog proxy (next.config.ts rewrites): no session work for analytics beacons.
// fonts/ holds public, content-addressed font files only (MiSans, ARCHITECTURE §17; Instrument Serif).
// assets/ is the template-cover rewrite to the public bucket (ARCHITECTURE §8.3, T51).
// api/version is the open tabs' version check (T90): no session work, no locale routing.
export const config = {
  matcher: ['/((?!_next/static|_next/image|ingest/|assets/|api/version$|fonts/|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|webmanifest)$).*)'],
}
