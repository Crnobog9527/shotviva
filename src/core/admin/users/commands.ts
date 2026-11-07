import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

import { adminAdjustCredits, callRpc } from '@/core/billing'
import { AppError, toAppError } from '@/core/errors'

// Writes for /admin/users: one SQL function each (AGENTS §5.1 rule 1). Adjusting writes the
// credit ledger (its reason is the record); ban and unban write admin_audit_log.

export const USER_ERRORS = {
  input: '请填写原因；调整积分时数量必须是非零整数。',
  insufficient: '扣减后余额会小于 0，已拒绝。',
  notFound: '用户不存在。',
  conflict: '这次调整已经提交过了，请刷新页面查看。',
} as const

export const reasonSchema = z.string().trim().min(1).max(500)

const reason = reasonSchema

const adjustSchema = z.object({
  userId: z.uuid(),
  pool: z.enum(['free', 'paid']),
  amount: z.number().int().refine((n) => n !== 0 && Math.abs(n) <= 100_000),
  reason,
  // From the dialog, so a double submit is one adjustment.
  idempotencyKey: z.uuid(),
})

const banSchema = z.object({ userId: z.uuid(), reason })

export function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input)
  if (!parsed.success) throw new AppError('INVALID_INPUT', USER_ERRORS.input)
  return parsed.data
}

// SQL errors arrive as AppErrors carrying the exception name; the admin reads Chinese.
export function friendly(error: unknown): never {
  const appError = toAppError(error)
  if (appError.code === 'CREDITS_INSUFFICIENT') throw new AppError(appError.code, USER_ERRORS.insufficient)
  if (appError.code === 'NOT_FOUND') throw new AppError(appError.code, USER_ERRORS.notFound)
  if (appError.code === 'CONFLICT') throw new AppError(appError.code, USER_ERRORS.conflict)
  if (appError.code === 'INVALID_INPUT') throw new AppError(appError.code, USER_ERRORS.input)
  throw appError
}

export async function adjustUserCredits(db: SupabaseClient, input: unknown): Promise<void> {
  const args = parse(adjustSchema, input)
  await adminAdjustCredits(db, {
    userId: args.userId,
    pool: args.pool,
    amount: args.amount,
    reason: args.reason,
    idempotencyKey: `admin:${args.idempotencyKey}`,
  }).catch(friendly)
}

export async function banUser(db: SupabaseClient, input: unknown): Promise<void> {
  const args = parse(banSchema, input)
  await callRpc(db, 'admin_ban_user', { p_user_id: args.userId, p_reason: args.reason }, z.unknown()).catch(friendly)
}

export async function unbanUser(db: SupabaseClient, input: unknown): Promise<void> {
  const args = parse(banSchema, input)
  await callRpc(db, 'admin_unban_user', { p_user_id: args.userId, p_reason: args.reason }, z.unknown()).catch(friendly)
}
