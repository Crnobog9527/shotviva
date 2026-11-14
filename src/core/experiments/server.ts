import 'server-only'

import { NextRequest, userAgent, type NextResponse } from 'next/server'

import { createAdminSupabase } from '../auth/supabase-admin'
import { EXPERIMENT_COOKIE, EXPERIMENT_COOKIE_MAX_AGE } from './cookie'
import { createLiveConfig } from './live-config'
import { PREVIEW_PARAM, routeExperiment, surfaceAt, type RouteOutcome } from './routing'
import type { ExperimentRegistry } from './types'

// Server entry, used by src/proxy.ts (ARCHITECTURE §16.5). One proxy instance holds the live experiments
// (live-config.ts); only addresses an experiment surface owns ever read them.

const liveExperiments = createLiveConfig(async (signal) => {
  const { data, error } = await createAdminSupabase().rpc('experiments_live').abortSignal(signal)
  if (error) throw new Error(error.message)
  return data
})

// Crawlers and headless browsers: Next's own list plus the words their user agents carry.
const BOT_WORDS = /bot|crawl|spider|slurp|headless|lighthouse|preview|facebookexternalhit|bingpreview|pagespeed/i

export function isBotRequest(request: NextRequest): boolean {
  const ua = request.headers.get('user-agent') ?? ''
  return !ua || userAgent(request).isBot || BOT_WORDS.test(ua)
}

export async function experimentRoute(request: NextRequest, registry: ExperimentRegistry, allowForce: boolean): Promise<RouteOutcome | null> {
  if (request.method !== 'GET' && request.method !== 'HEAD') return null
  if (!surfaceAt(request.nextUrl.pathname, registry)) return null
  const input = {
    pathname: request.nextUrl.pathname,
    params: request.nextUrl.searchParams,
    cookie: request.cookies.get(EXPERIMENT_COOKIE)?.value,
    isBot: isBotRequest(request),
    random: Math.random,
    allowForce,
  }
  // Crawlers and previews never need the live list; skip the read.
  const live = input.isBot || input.params.has(PREVIEW_PARAM) ? [] : await liveExperiments()
  return routeExperiment(input, live, registry)
}

// The request the locale router should see: the option's prerendered page, same query string.
// The browser keeps the address it asked for (a rewrite, not a redirect).
export function rewrittenRequest(request: NextRequest, path: string): NextRequest {
  const url = new URL(request.url)
  url.pathname = path
  return new NextRequest(url, request)
}

// The locale router answers a `/zh/…` address it needs no rewrite for with a plain "go on", which
// would serve the address the browser asked for, not the option page; that answer gets the rewrite
// here. Its rewrites (English: `/x/…` → `/en/x/…`) and redirects are kept as they are.
export function toOptionPage(router: (request: NextRequest) => NextResponse, request: NextRequest, path: string): NextResponse {
  const target = rewrittenRequest(request, path)
  const response = router(target)
  if (!response.headers.has('x-middleware-rewrite') && !response.headers.has('location')) {
    response.headers.delete('x-middleware-next')
    response.headers.set('x-middleware-rewrite', target.url)
  }
  return response
}

export function withExperimentCookie(response: NextResponse, outcome: RouteOutcome | null, secure: boolean): NextResponse {
  if (outcome?.cookie) {
    response.cookies.set(EXPERIMENT_COOKIE, outcome.cookie, { path: '/', maxAge: EXPERIMENT_COOKIE_MAX_AGE, sameSite: 'lax', secure })
  }
  return response
}

export { OPTION_PAGES, type RouteOutcome } from './routing'
export { mergeAccountRows, signupExperiments, syncExperimentsAtSignIn } from './sign-in'
