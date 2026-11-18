import createMiddleware from 'next-intl/middleware'
import type { NextFetchEvent, NextRequest, NextResponse } from 'next/server'

import { isAffiliateEnabled, requiresAffiliateProgram } from '@/core/affiliate/feature'
import { IDENTITY_HEADER } from '@/core/auth/forwarded-identity'
import { notFoundResponse } from '@/core/auth/proxy-gates'
import { recordReferral } from '@/core/affiliate/referral'
import { analyticsCookiesAllowed, withAnalyticsRegion } from '@/core/analytics/consent'
import { isLandingRequest, withFirstTouch } from '@/core/attribution/proxy'
import { hasSessionCookie, proxyGate, type Forward } from '@/core/auth/proxy'
import { captureCodeLink } from '@/core/codes/link'
import { isBadGalleryPage } from '@/core/gallery/page-number'
import { galleryWorkIdOf, liveGalleryGate } from '@/core/gallery/proxy-gate'
import { serverEnv } from '@/core/env'
import { experimentRoute, isBotRequest, OPTION_PAGES, toOptionPage, withExperimentCookie, type LiveConfigState, type RouteOutcome } from '@/core/experiments/server'
import { viaImageCdn } from '@/core/storage/image-cdn-guard'
import { routing } from '@/core/i18n/routing'
import { logger } from '@/core/logger'
import { publicEnv } from '@/core/public-env'
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
  return rewrite ? (forwarded) => toOptionPage(localeRouter, forwarded, rewrite) : localeRouter
}

// The cookies every page answer may carry. Whether analytics may use cookies for this visitor
// (ARCHITECTURE §16.1, T70; the test site and local dev accept ?sv_country=XX to act as a visitor
// from that country); the A/B assignment (§16.5); the first-touch landing (§16.6), kept only where
// analytics may keep something, and sealed with a server-only key (none, none set).
function visitorCookies(response: NextResponse, request: NextRequest, experiment: RouteOutcome | null) {
  const env = serverEnv()
  const options = { testOverride: env.VERCEL_ENV !== 'production' }
  withAnalyticsRegion(response, request, options)
  withExperimentCookie(response, experiment, request.nextUrl.protocol === 'https:')
  const secret = env.SUPABASE_SERVICE_ROLE_KEY
  if (secret) {
    withFirstTouch(response, request, { secret, allowed: analyticsCookiesAllowed(request, options), bot: isBotRequest(request), ownHost: site.brand.domain })
  }
}

// A fixed sample of homepage navigations, logged only on the server. The response can carry
// user-specific cookies, so keep request details and timing metadata off the response.
function homeProxyTiming(request: NextRequest) {
  const { pathname } = request.nextUrl
  if ((pathname !== '/' && pathname !== '/zh') || !isLandingRequest(request) || Math.random() >= 0.05) return
  const started = performance.now()
  const hasSession = hasSessionCookie(request)
  let experimentDone = started
  let gateDone = started
  let configState: LiveConfigState | 'skipped' = 'skipped'
  return {
    onRead: (state: LiveConfigState) => { configState = state },
    experimentDone: () => { experimentDone = performance.now() },
    gateDone: () => { gateDone = performance.now() },
    log(proxyStatus: number) {
      const finished = performance.now()
      logger.info('home.proxy_timing', {
        locale: pathname === '/zh' ? 'zh' : 'en',
        hasSession,
        configState,
        proxyStatus,
        experimentMs: Math.round(experimentDone - started),
        gateMs: Math.round(gateDone - experimentDone),
        visitorMs: Math.round(finished - gateDone),
        totalMs: Math.round(finished - started),
      })
    },
  }
}

export async function proxy(request: NextRequest, event: NextFetchEvent) {
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
  return forwardSiteRequest(request, event)
}

async function forwardSiteRequest(request: NextRequest, event: NextFetchEvent) {
  const env = serverEnv()
  // A/B experiments (ARCHITECTURE §16.5): on a surface's address, which option page answers. The
  // page itself stays prerendered; only this rewrite and the cookie differ per visitor.
  const timing = homeProxyTiming(request)
  const experiment = await experimentRoute(request, experimentRegistry, env.VERCEL_ENV !== 'production', {
    waitUntil: (promise) => event.waitUntil(promise),
    onRead: timing?.onRead,
  })
  timing?.experimentDone()
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
  if (env.VERCEL_ENV === 'preview') preloadCreatePage(request, response, event)
  timing?.gateDone()
  visitorCookies(response, request, experiment)
  await recordReferral(request, response)
  const result = withHostNoindex(response, request, hosts.canonicalHost)
  timing?.log(result.status)
  return result
}

let createPreloadStarted = false

function preloadCreatePage(request: NextRequest, response: NextResponse, event: NextFetchEvent) {
  if (createPreloadStarted || response.status !== 200 || request.method !== 'GET' ||
      !/^\/(zh\/)?generate\/?$/.test(request.nextUrl.pathname) ||
      request.headers.has('rsc') || request.headers.has('next-router-prefetch') || request.headers.get('purpose') === 'prefetch' ||
      !request.headers.has(IDENTITY_HEADER)) return
  createPreloadStarted = true
  // The gate stripped incoming identity headers and sealed this request's verified user.
  // Keep the preload outside the proxy response path and leave the page's checks in place.
  event.waitUntil(import('@/core/templates/create-catalogue')
    .then(({ preloadCreateCatalogue }) => preloadCreateCatalogue(publicEnv.NEXT_PUBLIC_APP_VERSION))
    .catch((error: unknown) => logger.warn('create.catalogue_preload_failed', { error })))
}

// /ingest is the PostHog proxy (next.config.ts rewrites): no session work for analytics beacons.
// fonts/ holds public, content-addressed font files only (MiSans, ARCHITECTURE §17; Instrument Serif).
// assets/ is the template-cover rewrite to the public bucket (ARCHITECTURE §8.3, T51).
// api/version is the open tabs' version check (T90): no session work, no locale routing.
export const config = {
  matcher: ['/((?!_next/static|_next/image|ingest/|assets/|api/version$|fonts/|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|webmanifest)$).*)'],
}
