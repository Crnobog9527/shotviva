import 'server-only'
import type { NextRequest } from 'next/server'

import { logger } from '../../logger'
import { parseFlow, type CallbackFlow } from './callback-url'
import { linkError, type CallbackOutcome } from './callback-target'
import { landingResponse, landOnSession, requestClient, type CookieToSet } from './landing'

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
  return landOnSession(supabase, flow, freeCredits)
}

// Landing for Google OAuth. Email links now go to /auth/confirm; this still accepts the old
// `?code=` email links already sitting in inboxes, so nothing sent before the switch breaks.
export async function handleAuthCallback(request: NextRequest, options: { freeCredits: number }) {
  const jar: CookieToSet[] = []
  const flow = parseFlow(request.nextUrl.searchParams.get('flow'))
  const outcome = await resolveOutcome(request, jar, flow, options.freeCredits)
  return landingResponse(outcome, request.nextUrl.searchParams.get('next'), jar)
}
