import 'server-only'

import type { NextRequest, NextResponse } from 'next/server'

import { splitLocale } from '../i18n/paths'
import { FIRST_TOUCH_COOKIE, FIRST_TOUCH_MAX_AGE, touchOf } from './first-touch'
import { openTouch, sealTouch } from './seal'

// The proxy's part of first-touch attribution (ARCHITECTURE §16.6). Set once, on the first public
// page a person opens in a browser (a document request, not a prefetch, an API call or a crawler),
// and only where analytics may keep something in the browser; never replaced while it is valid.
// Where analytics may not (asked and not accepted, or "Necessary only"), any copy is removed.

// Pages behind sign-in and the admin, route handlers and the experiments' option pages.
const NOT_PUBLIC = /^\/(?:admin|account|checkout|generate|photos|posters|wishlist|reset|x|api|auth|ingest|monitoring)(?:\/|$)/

export type FirstTouchContext = { secret: string; allowed: boolean; bot: boolean; ownHost: string; now?: number }

export function isLandingRequest(request: NextRequest): boolean {
  if (request.method !== 'GET') return false
  if (request.headers.has('rsc') || request.headers.has('next-router-prefetch') || request.headers.get('purpose') === 'prefetch') return false
  if (!(request.headers.get('accept') ?? '').includes('text/html')) return false
  return !NOT_PUBLIC.test(splitLocale(request.nextUrl.pathname).path)
}

export function withFirstTouch(response: NextResponse, request: NextRequest, context: FirstTouchContext): NextResponse {
  const held = request.cookies.get(FIRST_TOUCH_COOKIE)?.value
  if (!context.allowed) {
    if (held !== undefined) response.cookies.delete(FIRST_TOUCH_COOKIE)
    return response
  }
  if (context.bot || openTouch(held, context.secret) || !isLandingRequest(request)) return response
  const touch = touchOf({ url: request.nextUrl, referrer: request.headers.get('referer'), ownHost: context.ownHost, now: context.now ?? Date.now() })
  response.cookies.set(FIRST_TOUCH_COOKIE, sealTouch(touch, context.secret), {
    path: '/',
    maxAge: FIRST_TOUCH_MAX_AGE,
    sameSite: 'lax',
    httpOnly: true,
    secure: request.nextUrl.protocol === 'https:',
  })
  return response
}
