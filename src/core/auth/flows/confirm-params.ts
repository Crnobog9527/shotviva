import { z } from 'zod'

import type { CallbackError } from './callback-target'
import type { CallbackFlow } from './callback-url'

// The link types our email templates send (supabase/templates). `email` is Supabase's newer
// name for a signup confirmation; `invite` is left out because Shotviva sends no invites.
const CONFIRM_TYPES = ['signup', 'email', 'magiclink', 'recovery', 'email_change'] as const
export type ConfirmType = (typeof CONFIRM_TYPES)[number]

const confirmSchema = z.object({
  token_hash: z.string().regex(/^[A-Za-z0-9_-]{8,256}$/),
  type: z.enum(CONFIRM_TYPES),
})

export type ConfirmParams = { tokenHash: string; type: ConfirmType; flow: CallbackFlow }

export function parseConfirmParams(params: URLSearchParams): ConfirmParams | null {
  const parsed = confirmSchema.safeParse({ token_hash: params.get('token_hash'), type: params.get('type') })
  if (!parsed.success) return null
  const { token_hash: tokenHash, type } = parsed.data
  return { tokenHash, type, flow: type === 'recovery' ? 'recovery' : 'email' }
}

// A malformed link can only be a recovery link if it says so; otherwise treat it as email so
// the visitor lands on the login page, which explains the failure.
export function flowFromRawType(type: string | null): CallbackFlow {
  return type === 'recovery' ? 'recovery' : 'email'
}

// Supabase answers `otp_expired` for both an expired and an already-used token hash.
export function verifyError(error: { code?: string }): CallbackError {
  return error.code === 'otp_expired' ? 'link_expired' : 'callback_failed'
}
