import { appOrigin } from '../../site-url'
import { sanitizeNext } from '../redirect-target'

export type CallbackFlow = 'email' | 'oauth' | 'recovery'

// Built from the deployment origin (core/site-url), never the request Host header, so a spoofed host
// cannot make Supabase email a link to someone else's domain.
export function callbackUrl(next: string, flow: CallbackFlow = 'email'): string {
  const url = new URL('/auth/callback', appOrigin)
  url.searchParams.set('next', sanitizeNext(next))
  if (flow !== 'email') url.searchParams.set('flow', flow)
  return url.toString()
}

// `emailRedirectTo` / `redirectTo` for every auth email. The templates read it as
// {{ .RedirectTo }} and append `&token_hash=…&type=…`, so the URL must always carry a query
// string: `next` is always set, which guarantees one.
export function confirmUrl(next: string, origin: string = appOrigin): string {
  const url = new URL('/auth/confirm', origin)
  url.searchParams.set('next', sanitizeNext(next))
  return url.toString()
}

export function parseFlow(value: string | null): CallbackFlow {
  return value === 'oauth' || value === 'recovery' ? value : 'email'
}
