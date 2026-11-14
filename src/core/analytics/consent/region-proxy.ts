import type { NextRequest, NextResponse } from 'next/server'

import { needsConsent, REGION_COOKIE, REGION_OPEN, TEST_COUNTRY_COOKIE, TEST_COUNTRY_PARAM } from './region'

type Options = { testOverride: boolean }

// The visitor's country as the proxy should treat it: the test override first (outside
// production only), then Vercel's geolocation header.
function countryOf(request: NextRequest, { testOverride }: Options): string | null {
  if (testOverride) {
    const param = request.nextUrl.searchParams.get(TEST_COUNTRY_PARAM)
    if (param !== null) return param || request.headers.get('x-vercel-ip-country')
    const kept = request.cookies.get(TEST_COUNTRY_COOKIE)?.value
    if (kept) return kept
  }
  return request.headers.get('x-vercel-ip-country')
}

function keepTestCountry(request: NextRequest, response: NextResponse): void {
  const param = request.nextUrl.searchParams.get(TEST_COUNTRY_PARAM)
  if (param === null) return
  if (param) response.cookies.set(TEST_COUNTRY_COOKIE, param.toUpperCase(), { path: '/', sameSite: 'lax' })
  else response.cookies.delete(TEST_COUNTRY_COOKIE)
}

// ARCHITECTURE §16.1 (T70): the page learns whether its visitor must be asked from one cookie,
// because marketing pages are static and cannot carry the answer in their HTML. Written only
// when it changes, so most responses carry no Set-Cookie at all.
export function withAnalyticsRegion(response: NextResponse, request: NextRequest, options: Options): NextResponse {
  if (options.testOverride) keepTestCountry(request, response)
  const open = !needsConsent(countryOf(request, options))
  const marked = request.cookies.get(REGION_COOKIE)?.value === REGION_OPEN
  if (open && !marked) {
    response.cookies.set(REGION_COOKIE, REGION_OPEN, { path: '/', sameSite: 'lax', secure: request.nextUrl.protocol === 'https:' })
  } else if (!open && request.cookies.has(REGION_COOKIE)) {
    response.cookies.delete(REGION_COOKIE)
  }
  return response
}
