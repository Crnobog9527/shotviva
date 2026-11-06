import type { ErrorCode } from '../../errors'

// What a server action hands back to its form. Success usually redirects instead.
// `exists`: a sign-up for an address that already has an account (design/comps-v3-b/auth.html
// `?err=exists`); Supabase sends that address no email, so "check your email" would be untrue.
export type FormState =
  | { status: 'idle' }
  | { status: 'sent' }
  | { status: 'exists' }
  | { status: 'error'; code: ErrorCode }

export const IDLE: FormState = { status: 'idle' }

export function failed(code: ErrorCode): FormState {
  return { status: 'error', code }
}
