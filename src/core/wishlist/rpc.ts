import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { z } from 'zod'

import { AppError, type ErrorCode } from '../errors'

// Exception messages raised by the wishlist SQL functions (0061, 0062).
const SQL_ERROR_CODES: Record<string, ErrorCode> = {
  INVALID_INPUT: 'INVALID_INPUT',
  RATE_LIMITED: 'RATE_LIMITED',
  WISHLIST_NOT_ELIGIBLE: 'FORBIDDEN',
  PROFILE_NOT_FOUND: 'NOT_FOUND',
  REQUEST_NOT_FOUND: 'NOT_FOUND',
  TEMPLATE_NOT_FOUND: 'NOT_FOUND',
  REQUEST_NOT_LIVE: 'CONFLICT',
  REQUEST_TRANSITION_INVALID: 'CONFLICT',
}

// What a caller sees for each mapped code; the SQL message itself is never shown.
const MESSAGES: Partial<Record<ErrorCode, string>> = {
  FORBIDDEN: 'Create one photo first to join',
  RATE_LIMITED: 'Too many requests today; try again tomorrow',
  NOT_FOUND: 'That request no longer exists',
  CONFLICT: 'That request has changed; refresh and try again',
  INVALID_INPUT: 'Check the description and photos',
}

export function toWishlistError(fn: string, error: { message: string }): AppError {
  const code = SQL_ERROR_CODES[error.message]
  if (code) return new AppError(code, MESSAGES[code] ?? error.message, { cause: error })
  return new AppError('INTERNAL', `rpc ${fn} failed`, { cause: error })
}

// Service-role calls only: every wishlist function is revoked from client roles.
export async function wishlistRpc<T>(
  client: SupabaseClient,
  fn: string,
  args: Record<string, unknown>,
  schema: z.ZodType<T>,
): Promise<T> {
  const { data, error } = await client.rpc(fn, args)
  if (error) throw toWishlistError(fn, error)
  const parsed = schema.safeParse(data)
  if (!parsed.success) throw new AppError('INTERNAL', `rpc ${fn} returned an unexpected shape`, { cause: parsed.error })
  return parsed.data
}
