import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { z } from 'zod'

import { AppError, type ErrorCode } from '../errors'

// Exception messages raised by the ticket SQL functions (0221–0223).
const SQL_ERROR_CODES: Record<string, ErrorCode> = {
  INVALID_INPUT: 'INVALID_INPUT',
  RATE_LIMITED: 'RATE_LIMITED',
  PROFILE_NOT_FOUND: 'NOT_FOUND',
  TICKET_NOT_FOUND: 'NOT_FOUND',
  PAYMENT_NOT_FOUND: 'NOT_FOUND',
  JOB_NOT_FOUND: 'NOT_FOUND',
}

// Service-role calls only: every ticket function is revoked from client roles. The SQL message
// never reaches a user; callers turn the code into their own copy.
export async function supportRpc<T>(
  db: SupabaseClient,
  fn: string,
  args: Record<string, unknown>,
  schema: z.ZodType<T>,
): Promise<T> {
  const { data, error } = await db.rpc(fn, args)
  if (error) {
    const code = SQL_ERROR_CODES[error.message]
    throw code ? new AppError(code, error.message, { cause: error }) : new AppError('INTERNAL', `rpc ${fn} failed`, { cause: error })
  }
  const parsed = schema.safeParse(data)
  if (!parsed.success) throw new AppError('INTERNAL', `rpc ${fn} returned an unexpected shape`, { cause: parsed.error })
  return parsed.data
}

export function readFailed(what: string, error: { message: string }): never {
  throw new AppError('INTERNAL', `support ${what} failed`, { cause: new Error(error.message) })
}
