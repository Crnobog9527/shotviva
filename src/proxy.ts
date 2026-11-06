import type { NextRequest } from 'next/server'

import { proxyGate } from '@/core/auth'
import { canonicalRedirectResponse, withHostNoindex } from '@/core/seo'
import { site } from '@/site/site.config'

const hosts = { canonicalHost: site.brand.domain, redirectHosts: site.indexing.canonicalRedirectHosts }

// Production's vercel.app host 308s to the real domain once it is configured (ARCHITECTURE
// §12.0). Then the Supabase session is refreshed and /admin (404) and signed-in pages (307 to
// login) answer with real statuses before rendering; pages still call requireUser()/
// requireAdmin(). Every response gets X-Robots-Tag while indexing is closed or off-domain.
export async function proxy(request: NextRequest) {
  const redirect = canonicalRedirectResponse(request, hosts)
  if (redirect) return redirect
  return withHostNoindex(await proxyGate(request), request, hosts.canonicalHost)
}

// /ingest is the PostHog proxy (next.config.ts rewrites): no session work for analytics beacons.
export const config = {
  matcher: ['/((?!_next/static|_next/image|ingest/|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
}
