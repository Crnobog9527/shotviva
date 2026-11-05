import { sanitizeNext } from '../redirect-target'
import type { CallbackFlow } from './callback-url'

// Fixed codes only: the login page maps them to its own text, so a crafted link
// cannot put arbitrary words on the page.
export type CallbackError = 'link_expired' | 'callback_failed' | 'oauth_failed' | 'unverified'

export type CallbackOutcome =
  | { kind: 'error'; error: CallbackError; flow: CallbackFlow }
  | { kind: 'signed_in'; verified: boolean; userId: string; flow: CallbackFlow }
  | { kind: 'no_session'; flow: CallbackFlow }

// Where the browser goes after /auth/callback. Pure so every branch is unit-tested.
export function callbackTarget(outcome: CallbackOutcome, nextParam: string | null): string {
  const next = sanitizeNext(nextParam)
  if (outcome.kind === 'error') {
    if (outcome.flow === 'recovery') return '/reset?error=link_expired'
    return `/login?error=${outcome.error}&next=${encodeURIComponent(next)}`
  }
  if (outcome.kind === 'no_session') return `/login?next=${encodeURIComponent(next)}`
  if (outcome.flow === 'recovery') return '/reset/update'
  if (!outcome.verified) return '/login?error=unverified'
  return next
}

// Supabase appends error params to the redirect when a link is expired or already used.
export function linkError(params: URLSearchParams, flow: CallbackFlow): CallbackError | null {
  const code = params.get('error_code')
  if (code === 'otp_expired') return 'link_expired'
  if (code || params.has('error')) return flow === 'oauth' ? 'oauth_failed' : 'callback_failed'
  return null
}
