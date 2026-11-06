import createMiddleware from 'next-intl/middleware'
import type { NextRequest } from 'next/server'

import { proxyGate } from '@/core/auth/proxy'
import { serverEnv } from '@/core/env'
import { routing } from '@/core/i18n/routing'
import { canonicalRedirectResponse, withHostNoindex } from '@/core/seo'
import { site } from '@/site/site.config'

const hosts = { canonicalHost: site.brand.domain, redirectHosts: site.indexing.canonicalRedirectHosts }

// next-intl's router: /pricing is served from app/[locale] as `en`, /zh/pricing as `zh`, and
// /en/pricing redirects to /pricing. It never redirects by browser language (ARCHITECTURE §17).
const localeRouter = createMiddleware(routing)

// Production's vercel.app host 308s to the real domain once it is configured (ARCHITECTURE
// §12.0). Then the Supabase session is refreshed and /admin (404), signed-in pages (307 to the
// login page of the same language) and /zh addresses of English-only pages (the Chinese 404)
// answer with real statuses before rendering; pages still call requireUser()/requireAdmin().
// Every response gets X-Robots-Tag while indexing is closed or off-domain.
export async function proxy(request: NextRequest) {
  const redirect = canonicalRedirectResponse(request, hosts)
  if (redirect) return redirect
  const response = await proxyGate(request, {
    translatedPaths: site.locales.zhPaths,
    forward: localeRouter,
    // /generate/upload-test only under `next dev`.
    devPages: serverEnv().NODE_ENV === 'development',
  })
  return withHostNoindex(response, request, hosts.canonicalHost)
}

// /ingest is the PostHog proxy (next.config.ts rewrites): no session work for analytics beacons.
// fonts/misans/ holds public, content-addressed font files only (ARCHITECTURE §17).
export const config = {
  matcher: ['/((?!_next/static|_next/image|ingest/|fonts/misans/|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
}
