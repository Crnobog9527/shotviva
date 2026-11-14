import 'server-only'
import type { SignupBenefits } from '../signup-code'
import type { NextRequest } from 'next/server'

import { isAffiliateEnabled } from '../../affiliate/feature'
import { logger } from '../../logger'
import type { CallbackOutcome } from './callback-target'
import { flowFromRawType, parseConfirmParams, verifyError } from './confirm-params'
import { landingResponse, landOnSession, requestClient, type CookieToSet } from './landing'

async function resolveOutcome(request: NextRequest, jar: CookieToSet[], benefits: SignupBenefits): Promise<CallbackOutcome> {
  const params = request.nextUrl.searchParams
  const confirm = parseConfirmParams(params)
  if (!confirm || (confirm.type === 'invite' && !(await isAffiliateEnabled()))) return { kind: 'error', error: 'callback_failed', flow: flowFromRawType(params.get('type')) }

  const supabase = requestClient(request, jar)
  const { error } = await supabase.auth.verifyOtp({ token_hash: confirm.tokenHash, type: confirm.type })
  if (error) {
    logger.warn('auth email link verification failed', { code: error.code, type: confirm.type })
    return { kind: 'error', error: verifyError(error), flow: confirm.flow }
  }
  return landOnSession(supabase, confirm.flow, benefits, params.get('next'))
}

// Landing for every auth email link (signup, recovery, email change, magic link). The link
// points at our own origin and carries a token hash that is verified server-side, so the
// email never links to <ref>.supabase.co and the link works in a browser other than the one
// that asked for it (no PKCE verifier cookie needed).
export async function handleAuthConfirm(request: NextRequest, options: SignupBenefits) {
  const jar: CookieToSet[] = []
  const outcome = await resolveOutcome(request, jar, options)
  return landingResponse(request, outcome, jar)
}
