import 'server-only'
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

import { logger } from '../../logger'
import { publicEnv } from '../../public-env'
import { appOrigin } from '../../site-url'
import { onVerifiedSignIn } from '../first-sign-in'
import { isEmailVerified } from '../session-user'
import { parseFlow, type CallbackFlow } from './callback-url'
import { callbackTarget, linkError, type CallbackOutcome } from './callback-target'

type CookieToSet = { name: string; value: string; options: Parameters<NextResponse['cookies']['set']>[2] }

function requestClient(request: NextRequest, jar: CookieToSet[]) {
  return createServerClient(publicEnv.NEXT_PUBLIC_SUPABASE_URL, publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookies) => void jar.push(...cookies),
    },
  })
}

async function resolveOutcome(request: NextRequest, jar: CookieToSet[], flow: CallbackFlow, freeCredits: number) {
  const params = request.nextUrl.searchParams
  const error = linkError(params, flow)
  if (error) return { kind: 'error', error, flow } satisfies CallbackOutcome

  const supabase = requestClient(request, jar)
  const code = params.get('code')
  if (code) {
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
    if (exchangeError) {
      logger.warn('auth code exchange failed', { code: exchangeError.code, flow })
      return { kind: 'error', error: flow === 'oauth' ? 'oauth_failed' : 'callback_failed', flow } satisfies CallbackOutcome
    }
  }
  const { data } = await supabase.auth.getUser()
  if (!data.user) return { kind: 'no_session', flow } satisfies CallbackOutcome
  const verified = isEmailVerified(data.user)
  if (verified) await onVerifiedSignIn(data.user.id, freeCredits, flow === 'oauth' ? 'google' : 'email')
  return { kind: 'signed_in', verified, userId: data.user.id, flow } satisfies CallbackOutcome
}

// Landing for email confirmation, Google OAuth and password-recovery links.
export async function handleAuthCallback(request: NextRequest, options: { freeCredits: number }) {
  const jar: CookieToSet[] = []
  const flow = parseFlow(request.nextUrl.searchParams.get('flow'))
  const outcome = await resolveOutcome(request, jar, flow, options.freeCredits)
  const target = callbackTarget(outcome, request.nextUrl.searchParams.get('next'))
  const response = NextResponse.redirect(new URL(target, appOrigin))
  jar.forEach(({ name, value, options: cookieOptions }) => response.cookies.set(name, value, cookieOptions))
  return response
}
