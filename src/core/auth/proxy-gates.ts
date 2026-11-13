import { NextResponse, type NextRequest } from 'next/server'

import { chosenLocale } from '../i18n/locale-cookie'
import { localeRedirect } from '../i18n/locale-redirect'
import { DEFAULT_LOCALE, LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE, type Locale } from '../i18n/locales'
import { localizePath, matchesPaths, splitLocale } from '../i18n/paths'
import { publicEnv } from '../public-env'
import { loginPath } from './redirect-target'
import { toSessionUser, type SessionUser } from './session-user'
import { NOT_FOUND_PAGE, NOT_FOUND_RENDER_HEADER, localizedNotFound, plainNotFound, type FetchPage } from './not-found-page'
import { forwardRequest, hasSessionCookie, proxySupabase, updateSession, withCookies, type Forward } from './update-session'

// With cacheComponents, notFound()/redirect() inside a page stream as a 200 after the
// static shell has gone out. These gates answer with a real status before rendering;
// requireUser()/requireAdmin() in pages and actions stay as the authoritative check.
const ADMIN = /^\/admin(\/|$)/
// The app shell (Create, Photos, Wishlist, Account, the checkout return) is signed-in only
// (DESIGN §8.1).
// /connect/graylum is gated as a page only: its form POST (…/authorize) handles a lost
// session itself, since a 307 here would replay the POST against the login page.
const SIGNED_IN = /^\/(account|checkout|generate|photos|posters|wishlist|reset\/update)(\/|$)|^\/connect\/graylum\/?$/
// Development-only harnesses (the T4 upload test): a real 404 everywhere else, in any language.
const DEV_ONLY = /^\/generate\/upload-test\/?$/
// Route handlers and files outside the locale tree: session refresh only, no locale routing.
const NOT_A_PAGE = /^\/(api|auth|ingest|monitoring)(\/|$)|^\/(sitemap[\w-]*\.xml|robots\.txt|llms\.txt)$/

export type Gate = 'admin' | 'signed_in' | null

// `translatedPaths`: pages with a /zh version (site.config); `forward` hands a page request to
// the locale router (next-intl middleware), which rewrites /pricing to the [locale] tree.
export type ProxyGateOptions = {
  translatedPaths: readonly string[]
  forward: Forward
  devPages?: boolean
  // Tests pass their own; the proxy uses fetch.
  fetchPage?: FetchPage
}

// `pathname` is the logical path, without the /zh prefix.
export function gateFor(pathname: string): Gate {
  if (ADMIN.test(pathname)) return 'admin'
  if (SIGNED_IN.test(pathname)) return 'signed_in'
  return null
}

export function notFoundResponse(): NextResponse {
  return plainNotFound()
}

export async function currentProxyUser(request: NextRequest) {
  const { supabase, response } = proxySupabase(request)
  const { data } = await supabase.auth.getUser()
  if (!data.user) return { user: null, response }
  const { data: profile } = await supabase.from('profiles').select('role, banned_at').eq('id', data.user.id).maybeSingle()
  return { user: toSessionUser(data.user, profile), response }
}

// Pure decision so every branch is unit-tested without a network. `pathname` is the address
// as requested (it becomes `next`), `locale` picks which login page to send a visitor to.
export function decide(
  gate: Exclude<Gate, null>,
  user: SessionUser | null,
  pathname: string,
  search: string,
  locale: Locale = DEFAULT_LOCALE,
) {
  if (gate === 'admin') return user?.verified && user.role === 'admin' && !user.banned ? 'pass' : 'not_found'
  if (!user) return { redirect: localizePath(loginPath(`${pathname}${search}`), locale) }
  if (!user.verified) return { redirect: localizePath('/login?error=unverified', locale) }
  return 'pass'
}

// Page addresses are lowercase by rule (建站规格 R4) and the gates below match lowercase only,
// while the locale router matches case-insensitively: /Admin or /ACCOUNT must never slip past
// them. Percent-escapes (%2F) are left as they are.
export function lowercasePath(pathname: string): string | null {
  const lower = pathname.replace(/%[0-9A-Fa-f]{2}|[^%]+/g, (part) => (part.startsWith('%') ? part : part.toLowerCase()))
  return lower === pathname ? null : lower
}

// Answers that need no session: wrong case, development-only pages, /zh addresses of
// English-only pages (ARCHITECTURE §17). null means "go on to the gates".
async function addressAnswer(request: NextRequest, options: ProxyGateOptions): Promise<NextResponse | null> {
  const { pathname, search } = request.nextUrl
  const lower = lowercasePath(pathname)
  if (lower) return NextResponse.redirect(new URL(`${lower}${search}`, request.url), 308)
  const { locale, path } = splitLocale(pathname)
  if (path === NOT_FOUND_PAGE) {
    return request.headers.get(NOT_FOUND_RENDER_HEADER) === '1' ? null : localizedNotFound(request, locale, options.fetchPage)
  }
  if (DEV_ONLY.test(path) && (!options.devPages || locale !== DEFAULT_LOCALE)) return notFoundResponse()
  if (locale !== DEFAULT_LOCALE && !matchesPaths(path, options.translatedPaths)) {
    return localizedNotFound(request, locale, options.fetchPage)
  }
  return null
}

// A 307 to the chosen language's twin (ARCHITECTURE §17); null when there is nothing to move.
function toChosenLocale(request: NextRequest, chosen: Locale | null, translatedPaths: readonly string[]): NextResponse | null {
  const { pathname, search } = request.nextUrl
  const target = localeRedirect({ method: request.method, pathname, search, chosen }, translatedPaths)
  return target ? NextResponse.redirect(new URL(target, request.url), 307) : null
}

// Signed in on another device, or before the cookie existed: the account's own language
// (user_metadata.locale) stands in for the cookie on app pages, and is copied into it.
export function toAccountLocale(request: NextRequest, user: SessionUser | null, translatedPaths: readonly string[]): NextResponse | null {
  if (!user?.locale) return null
  const moved = toChosenLocale(request, user.locale, translatedPaths)
  moved?.cookies.set(LOCALE_COOKIE, user.locale, { path: '/', maxAge: LOCALE_COOKIE_MAX_AGE, sameSite: 'lax' })
  return moved
}

export async function proxyGate(request: NextRequest, options: ProxyGateOptions): Promise<NextResponse> {
  const { pathname, search } = request.nextUrl
  if (NOT_A_PAGE.test(pathname)) return updateSession(request, forwardRequest)
  const early = await addressAnswer(request, options)
  if (early) return early
  const chosen = chosenLocale(request.headers.get('cookie') ?? '')
  const moved = toChosenLocale(request, chosen, options.translatedPaths)
  if (moved) return moved
  const { locale, path } = splitLocale(pathname)
  const gate = gateFor(path)
  if (!gate) return updateSession(request, options.forward)
  const configured = Boolean(publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  const { user, response } = hasSessionCookie(request) && configured
    ? await currentProxyUser(request)
    : { user: null, response: () => NextResponse.next({ request }) }
  const verdict = decide(gate, user, pathname, search, locale)
  return withCookies(gatedAnswer(request, verdict, chosen ? null : user, options), response())
}

// What a gated page answers once the session is known. `user` is passed only when no language
// was chosen on this device, so the account's language can stand in (ARCHITECTURE §17).
function gatedAnswer(request: NextRequest, verdict: ReturnType<typeof decide>, user: SessionUser | null, options: ProxyGateOptions) {
  if (verdict === 'pass') return toAccountLocale(request, user, options.translatedPaths) ?? options.forward(request)
  if (verdict === 'not_found') return notFoundResponse()
  return NextResponse.redirect(new URL(verdict.redirect, request.url))
}
