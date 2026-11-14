import { NextRequest, NextResponse } from 'next/server'
import { CODE_COOKIE, codeCookieOptions, normalizeCode } from './index'

// Consume on page navigation only. The auth callback's own ?code is a PKCE credential.
// Strip the marketing parameter before analytics or outbound links see the page URL.
export function captureCodeLink(request: NextRequest) {
  const url = request.nextUrl
  if (request.method !== 'GET' || /^\/(api|auth|monitoring|ingest)(\/|$)/i.test(url.pathname)) return null
  if (request.headers.has('next-router-prefetch') || request.headers.get('purpose') === 'prefetch') return null
  const code = normalizeCode(url.searchParams.get('code'))
  if (!code) return null
  const clean = url.clone()
  clean.searchParams.delete('code')
  const response = NextResponse.redirect(clean, 307)
  response.cookies.set(CODE_COOKIE, code, codeCookieOptions)
  response.headers.set('Cache-Control', 'private, no-store')
  response.headers.set('Referrer-Policy', 'no-referrer')
  return response
}
