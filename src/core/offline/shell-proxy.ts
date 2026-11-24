import { NextResponse, type NextRequest } from 'next/server'

import { IDENTITY_HEADER } from '../auth/forwarded-identity'
import { SHELL_PRELOAD_PREFIX } from './shell-worker'

// The proxy's part in Create's app shell (ARCHITECTURE §18.3), ahead of every session step.
//
// - /app-shell/generate and /zh/app-shell/generate: the Create frame with every personal part at its
//   placeholder. The page shares the app layout, whose session-reading holes (identity, the Admin
//   item, the member's standing) would render the account for a signed-in visitor; so the request
//   is forwarded without its Cookie header (nor a forged identity header), whoever asks: the page
//   can only ever render signed out. No session refresh, no visitor cookies on the answer. It says
//   private, no-store (never on a CDN), noindex, and which build it belongs to (X-SV-Shell), the only
//   answer the service worker keeps for a page.
// - A navigation preload of /generate whose header says the worker answers with its shell gets an
//   empty 204 at once, instead of the page rendered for nothing (shell-worker.ts).
export const SHELL_PATHS = { en: '/app-shell/generate', zh: '/zh/app-shell/generate' } as const
const CREATE_PATHS = new Set(['/generate', '/generate/', '/zh/generate', '/zh/generate/'])

export function shellProxyAnswer(request: NextRequest, version: string): NextResponse | null {
  const { pathname, search } = request.nextUrl
  const preload = request.headers.get('service-worker-navigation-preload')
  if (version && preload === `${SHELL_PRELOAD_PREFIX}${version}` && CREATE_PATHS.has(pathname)) {
    return new NextResponse(null, { status: 204, headers: { 'Cache-Control': 'private, no-store' } })
  }
  const locale = pathname === SHELL_PATHS.en ? 'en' : pathname === SHELL_PATHS.zh ? 'zh' : null
  if (!locale) return null
  const headers = new Headers(request.headers)
  headers.delete('cookie')
  headers.delete(IDENTITY_HEADER)
  // The default language has no prefix in the address; its pages live under app/[locale] as `en`.
  const response = locale === 'en'
    ? NextResponse.rewrite(new URL(`/en${SHELL_PATHS.en}${search}`, request.url), { request: { headers } })
    : NextResponse.next({ request: { headers } })
  response.headers.set('Cache-Control', 'private, no-store')
  response.headers.set('X-Robots-Tag', 'noindex')
  response.headers.set('X-SV-Shell', version)
  return response
}
