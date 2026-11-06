import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'

import { assertSameOrigin, loginPath, type SessionUser } from '../auth'
import type { PartnerSiteConfig } from '../config'
import { DEFAULT_LOCALE, type Locale } from '../i18n/locales'
import { localizePath } from '../i18n/paths'
import { logger } from '../logger'
import { issueLinkCode } from './link-code'
import { connectRedirectUrl, parseConnectRequest } from './return-to'

export const CONNECT_PAGE_PATH = '/connect/graylum'

export function connectPagePath(params: { state?: string | null; return_to?: string | null }): string {
  const query = new URLSearchParams()
  if (params.state) query.set('state', params.state)
  if (params.return_to) query.set('return_to', params.return_to)
  const search = query.toString()
  return search ? `${CONNECT_PAGE_PATH}?${search}` : CONNECT_PAGE_PATH
}

export type ConnectAuthorizeDeps = {
  db: () => SupabaseClient
  user: () => Promise<SessionUser | null>
  config: PartnerSiteConfig
  // Language of the connect page that posted; the login detour stays in it.
  locale?: Locale
}

const plain = (body: string, status: number) =>
  new NextResponse(body, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } })

export type ConnectFailureCode = 'invalid' | 'failed'

// Back to the connect page in its "not valid" / "went wrong" state (B comp connect.html
// ?v=error). Nothing from the request is echoed into the address.
function failurePage(request: NextRequest, failure: ConnectFailureCode, locale: Locale): NextResponse {
  const page = localizePath(`${CONNECT_PAGE_PATH}?error=${failure}`, locale)
  return NextResponse.redirect(new URL(page, request.url), 303)
}

const field = (form: FormData, name: string) => {
  const value = form.get(name)
  return typeof value === 'string' ? value : null
}

// The "Allow" button's form POST (ARCHITECTURE §14.2): mint the one-time code and 302 back
// to Graylum's allowlisted callback with the original state. A plain form POST plus a real
// 302 keeps the hop visible and works without client JavaScript.
export async function handleConnectAuthorize(request: NextRequest, deps: ConnectAuthorizeDeps): Promise<NextResponse> {
  try {
    assertSameOrigin(request)
  } catch {
    return plain('Bad origin', 403)
  }
  const form = await request.formData().catch(() => new FormData())
  const params = { state: field(form, 'state'), return_to: field(form, 'return_to') }
  const connect = parseConnectRequest(params, deps.config)
  const locale = deps.locale ?? DEFAULT_LOCALE
  if (!connect) return failurePage(request, 'invalid', locale)

  const user = await deps.user()
  // The session expired between showing the page and the click: sign in, then start over.
  if (!user || !user.emailVerified) {
    const login = localizePath(loginPath(localizePath(connectPagePath(params), locale)), locale)
    return NextResponse.redirect(new URL(login, request.url), 303)
  }
  try {
    const code = await issueLinkCode(deps.db(), user.id)
    return NextResponse.redirect(connectRedirectUrl(connect, code), 302)
  } catch (error) {
    logger.error('connect authorize failed', { error })
    return failurePage(request, 'failed', locale)
  }
}
