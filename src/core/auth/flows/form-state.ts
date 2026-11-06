import type { ErrorCode } from '../../errors'

// What a server action hands back to its form. Success usually redirects instead.
export type FormState =
  | { status: 'idle' }
  | { status: 'sent' }
  | { status: 'error'; code: ErrorCode }

export const IDLE: FormState = { status: 'idle' }

export function failed(code: ErrorCode): FormState {
  return { status: 'error', code }
}
