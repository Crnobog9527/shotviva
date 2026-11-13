import 'server-only'
import type { SignupBenefits } from '../signup-code'
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

import { publicEnv } from '../../public-env'
import { requestOrigin } from '../../request-origin'
import type { Locale } from '../../i18n/locales'
import { localeOfPath } from '../../i18n/paths'
import { logger } from '../../logger'
import { onVerifiedSignIn } from '../first-sign-in'
import { sanitizeNext } from '../redirect-target'
import { isVerified, metadataLocale } from '../session-user'
import type { CallbackFlow } from './callback-url'
import { callbackTarget, type CallbackOutcome } from './callback-target'
import { withDbTiers } from '../../templates/db-resolution'

// Shared by /auth/callback (OAuth code exchange) and /auth/confirm (email token hash), so both
// landings run the same post-verification path: signup IP, free-credit grant, `signup` event.

export type CookieToSet = { name: string; value: string; options: Parameters<NextResponse['cookies']['set']>[2] }

// Session cookies are collected here and copied onto the redirect, which is the response the
// browser actually receives.
export function requestClient(request: NextRequest, jar: CookieToSet[]) {
  return createServerClient(publicEnv.NEXT_PUBLIC_SUPABASE_URL, publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    global: { fetch: withDbTiers() },
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookies) => void jar.push(...cookies),
    },
  })
}

export type RequestClient = ReturnType<typeof requestClient>

// The landing has no page language; `next` was written in the language the flow started in.
export async function landOnSession(
  supabase: RequestClient,
  flow: CallbackFlow,
  benefits: SignupBenefits,
  nextParam: string | null,
): Promise<CallbackOutcome> {
  const { data } = await supabase.auth.getUser()
  if (!data.user) return { kind: 'no_session', flow }
  const verified = isVerified(data.user)
  const stored = metadataLocale(data.user)
  const locale = stored ?? localeOfPath(sanitizeNext(nextParam))
  // Google accounts never pass through signUp, so their auth emails would stay English: store
  // the language the sign-in started in, once (ARCHITECTURE §7). Email sign-ups already have it.
  if (flow === 'oauth' && !stored) await rememberAccountLocale(supabase, locale)
  if (verified) await onVerifiedSignIn(data.user.id, benefits, flow === 'oauth' ? 'google' : 'email', locale)
  return { kind: 'signed_in', verified, userId: data.user.id, flow }
}

async function rememberAccountLocale(supabase: RequestClient, locale: Locale): Promise<void> {
  const { error } = await supabase.auth.updateUser({ data: { locale } })
  // Not worth failing a sign-in over: the emails fall back to English.
  if (error) logger.warn('could not store the account language', { code: error.code })
}

// Back to the host the link was opened on (when it is allow-listed), where the cookies were
// just set: redirecting a test-site alias to the branch URL lands signed out (core/request-origin).
export function landingResponse(request: NextRequest, outcome: CallbackOutcome, jar: CookieToSet[]): NextResponse {
  const target = callbackTarget(outcome, request.nextUrl.searchParams.get('next'))
  const response = NextResponse.redirect(new URL(target, requestOrigin(request)))
  jar.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
  return response
}
