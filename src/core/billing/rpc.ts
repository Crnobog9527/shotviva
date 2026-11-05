import 'server-only'

import type { z } from 'zod'

import { AppError, type ErrorCode } from '@/core/errors'

// The slice of a Supabase client these wrappers use. Structural on purpose: callers pass
// their service-role client (T1 owns its construction) and tests can pass a PostgREST
// adapter. Never pass a user-session client: every function below is service_role only.
export type RpcResult = { data: unknown; error: { message: string; code?: string } | null }

export type RpcClient = {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<RpcResult>
}

// SQL functions raise these exception messages (supabase/migrations/0023–0026).
const SQL_ERROR_CODES: Record<string, ErrorCode> = {
  CREDITS_INSUFFICIENT: 'CREDITS_INSUFFICIENT',
  INVALID_INPUT: 'INVALID_INPUT',
  PROFILE_NOT_FOUND: 'NOT_FOUND',
  JOB_NOT_FOUND: 'NOT_FOUND',
  PRODUCT_NOT_FOUND: 'NOT_FOUND',
  IDEMPOTENCY_CONFLICT: 'CONFLICT',
  JOB_ALREADY_SETTLED: 'CONFLICT',
  USER_BANNED: 'FORBIDDEN',
}

export function toRpcError(fn: string, error: { message: string; code?: string }): AppError {
  const code = SQL_ERROR_CODES[error.message]
  if (code) return new AppError(code, error.message)
  return new AppError('INTERNAL', `rpc ${fn} failed`, { cause: error })
}

export async function callRpc<T>(
  client: RpcClient,
  fn: string,
  args: Record<string, unknown>,
  schema: z.ZodType<T>,
): Promise<T> {
  const { data, error } = await client.rpc(fn, args)
  if (error) throw toRpcError(fn, error)
  const parsed = schema.safeParse(data)
  if (!parsed.success) {
    throw new AppError('INTERNAL', `rpc ${fn} returned an unexpected shape`, { cause: parsed.error })
  }
  return parsed.data
}
