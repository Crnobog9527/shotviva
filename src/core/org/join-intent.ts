import 'server-only'

import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'

import { getSessionUser, signupPath } from '../auth'
import { DEFAULT_LOCALE, isLocale } from '../i18n/locales'
import { localizePath } from '../i18n/paths'

// Proof that this browser went to sign-up or sign-in from an invite page (review of #829, P1):
// `?auto=1` alone is only a URL, and anyone can send a signed-in member a link carrying it. The
// join page auto-joins only when this httpOnly cookie names the same token, and the join action
// clears it. Set only for a signed-out visitor, by the route below; short-lived.
export const JOIN_INTENT_COOKIE = 'sv_org_join'
const MAX_AGE_SECONDS = 30 * 60
const TOKEN = /^[0-9a-f]{32}$/

export function shouldAutoJoin(input: { auto: string | string[] | undefined; cookie: string | undefined; token: string }): boolean {
  return input.auto === '1' && TOKEN.test(input.token) && input.cookie === input.token
}

export async function readJoinIntent(): Promise<string | undefined> {
  return (await cookies()).get(JOIN_INTENT_COOKIE)?.value
}

export async function clearJoinIntent(): Promise<void> {
  (await cookies()).delete(JOIN_INTENT_COOKIE)
}

// GET /api/join/org/<token>?locale=zh, where the invite page sends a signed-out visitor (a page
// cannot set cookies). Signed out: remember the token, then sign-up with the page as `next`.
// Signed in (or the session check failed): straight back to the page, no cookie, so the page
// shows its confirmation button. A malformed token never gets a cookie.
export async function handleJoinIntent(request: NextRequest, token: string): Promise<NextResponse> {
  const raw = request.nextUrl.searchParams.get('locale')
  const locale = isLocale(raw) ? raw : DEFAULT_LOCALE
  const page = localizePath(`/join/org/${encodeURIComponent(token)}`, locale)
  const signedOut = await getSessionUser().then((user) => user === null, () => false)
  if (!TOKEN.test(token) || !signedOut) return NextResponse.redirect(new URL(page, request.url), 303)
  const target = localizePath(signupPath(`${page}?auto=1`), locale)
  const response = NextResponse.redirect(new URL(target, request.url), 303)
  response.cookies.set(JOIN_INTENT_COOKIE, token, {
    httpOnly: true,
    secure: request.nextUrl.protocol === 'https:',
    sameSite: 'lax',
    path: '/',
    maxAge: MAX_AGE_SECONDS,
  })
  return response
}
