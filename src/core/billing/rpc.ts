import 'server-only'

import type { z } from 'zod'

import { AppError, TierRequiredError, type ErrorCode } from '@/core/errors'

// The slice of a Supabase client these wrappers use. Structural on purpose: callers pass
// their service-role client (T1 owns its construction) and tests can pass a PostgREST
// adapter. Never pass a user-session client: every function below is service_role only.
export type RpcResult = { data: unknown; error: { message: string; code?: string; details?: string } | null }

export type RpcClient = {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<RpcResult>
}

// SQL functions raise these exception messages (supabase/migrations/0023–0026, 0141–0142).
const SQL_ERROR_CODES: Record<string, ErrorCode> = {
  CREDITS_INSUFFICIENT: 'CREDITS_INSUFFICIENT',
  INVALID_INPUT: 'INVALID_INPUT',
  PROFILE_NOT_FOUND: 'NOT_FOUND',
  JOB_NOT_FOUND: 'NOT_FOUND',
  // An edit's source is not the caller's own succeeded work (T30).
  PARENT_JOB_NOT_FOUND: 'NOT_FOUND',
  TEMPLATE_NOT_FOUND: 'NOT_FOUND',
  TEMPLATE_UNAVAILABLE: 'TEMPLATE_UNAVAILABLE',
  TEMPLATE_QUOTE_CHANGED: 'TEMPLATE_QUOTE_CHANGED',
  PRODUCT_NOT_FOUND: 'NOT_FOUND',
  IDEMPOTENCY_CONFLICT: 'CONFLICT',
  CODE_CHECKOUT_OFFER_CHANGED: 'CODE_CHECKOUT_OFFER_CHANGED',
  DOWNGRADE_NOT_ALLOWED: 'DOWNGRADE_NOT_ALLOWED',
  CATALOG_OFFER_CHANGED: 'CODE_CHECKOUT_OFFER_CHANGED',
  CATALOG_CHANNEL_UNVERIFIED: 'CODE_CHECKOUT_OFFER_CHANGED',
  CODE_CHECKOUT_FLOOR: 'CODE_CHECKOUT_FLOOR',
  JOB_ALREADY_SETTLED: 'CONFLICT',
  // A work still generating cannot be deleted (T41).
  JOB_RUNNING: 'CONFLICT',
  USER_BANNED: 'FORBIDDEN',
  // An admin-only setting saved by someone who is not an admin (T62).
  NOT_ADMIN: 'FORBIDDEN',
  // A free work cannot be made private (ARCHITECTURE §6.2).
  FREE_WORK_PUBLIC: 'FORBIDDEN',
  // Dispute evidence (T82): an unknown dispute, a Managed Payments one (Stripe answers it), and a
  // second submit of the one submission Stripe allows.
  DISPUTE_NOT_FOUND: 'NOT_FOUND',
  DISPUTE_NOT_OURS: 'FORBIDDEN',
  DISPUTE_ALREADY_SUBMITTED: 'CONFLICT',
  // T71: the admin's clawback names a payment that does not exist.
  PAYMENT_NOT_FOUND: 'NOT_FOUND',
  // Admin test runs (T85): the day's budget is spent; an edit's parent or a photo is gone.
  TEST_BUDGET_EXCEEDED: 'TEST_BUDGET_EXCEEDED',
  TEST_RUN_NOT_FOUND: 'NOT_FOUND',
  TEST_PHOTO_NOT_FOUND: 'NOT_FOUND',
  // T87: a cover translation can only be its target language's "after".
  TRANSLATE_TARGET_ONLY: 'INVALID_INPUT',
}

export function toRpcError(fn: string, error: { message: string; code?: string }): AppError {
  if (error.message === 'BATCH_MAX_REQUIRED') return new TierRequiredError('max', 'Multiple templates require Max')
  if (/^CATALOG_(?:CODE|COST)_FLOOR(?:$|:)/.test(error.message)) return new AppError('CODE_CHECKOUT_FLOOR', 'Checkout price is below the current floor', { cause: error })
  const code = SQL_ERROR_CODES[error.message]
  if (code === 'TEMPLATE_UNAVAILABLE') return new AppError(code, 'This template is temporarily unavailable. Please try again later.')
  if (code === 'TEMPLATE_QUOTE_CHANGED') return new AppError(code, 'Refresh the template price before generating.')
  if (code) return new AppError(code, error.message, { cause: error })
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
