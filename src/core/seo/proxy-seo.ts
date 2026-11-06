import 'server-only'

import { NextResponse, type NextRequest } from 'next/server'

import { serverEnv } from '../env'
import { appOrigin } from '../site-url'
import { canonicalHostRedirect } from './canonical-host'
import { NOINDEX_HEADER, noindexForHost } from './indexing-env'
import { indexingOpenNow } from './indexing-now'

type HostConfig = { canonicalHost: string; redirectHosts: readonly string[] }

// Proxy step 1 (ARCHITECTURE §12.0): production's vercel.app host 308s to the canonical domain.
export function canonicalRedirectResponse(request: NextRequest, config: HostConfig): NextResponse | null {
  const { pathname, search } = request.nextUrl
  const input = { ...config, host: request.headers.get('host'), vercelEnv: serverEnv().VERCEL_ENV, appOrigin }
  const target = canonicalHostRedirect(input, `${pathname}${search}`)
  if (!target) return null
  const response = NextResponse.redirect(target, 308)
  response.headers.set(NOINDEX_HEADER.key, NOINDEX_HEADER.value)
  return response
}

// Proxy step 2: next.config.ts headers() covers what Next serves; this covers the responses the
// proxy builds itself (login 307s, admin 404s), which skip those rules.
export function withHostNoindex(response: NextResponse, request: NextRequest, canonicalHost: string): NextResponse {
  if (noindexForHost(indexingOpenNow(), request.headers.get('host'), canonicalHost)) {
    response.headers.set(NOINDEX_HEADER.key, NOINDEX_HEADER.value)
  }
  return response
}
