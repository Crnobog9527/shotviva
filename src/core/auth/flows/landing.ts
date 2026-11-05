import 'server-only'
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

import { publicEnv } from '../../public-env'
import { appOrigin } from '../../site-url'
import { onVerifiedSignIn } from '../first-sign-in'
import { isEmailVerified } from '../session-user'
import type { CallbackFlow } from './callback-url'
import { callbackTarget, type CallbackOutcome } from './callback-target'

// Shared by /auth/callback (OAuth code exchange) and /auth/confirm (email token hash), so both
// landings run the same post-verification path: signup IP, free-credit grant, `signup` event.

export type CookieToSet = { name: string; value: string; options: Parameters<NextResponse['cookies']['set']>[2] }

// Session cookies are collected here and copied onto the redirect, which is the response the
// browser actually receives.
export function requestClient(request: NextRequest, jar: CookieToSet[]) {
  return createServerClient(publicEnv.NEXT_PUBLIC_SUPABASE_URL, publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookies) => void jar.push(...cookies),
    },
  })
}

export type RequestClient = ReturnType<typeof requestClient>

export async function landOnSession(supabase: RequestClient, flow: CallbackFlow, freeCredits: number): Promise<CallbackOutcome> {
  const { data } = await supabase.auth.getUser()
  if (!data.user) return { kind: 'no_session', flow }
  const verified = isEmailVerified(data.user)
  if (verified) await onVerifiedSignIn(data.user.id, freeCredits, flow === 'oauth' ? 'google' : 'email')
  return { kind: 'signed_in', verified, userId: data.user.id, flow }
}

export function landingResponse(outcome: CallbackOutcome, nextParam: string | null, jar: CookieToSet[]): NextResponse {
  const response = NextResponse.redirect(new URL(callbackTarget(outcome, nextParam), appOrigin))
  jar.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
  return response
}
