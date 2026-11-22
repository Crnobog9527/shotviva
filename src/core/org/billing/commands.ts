import 'server-only'

import { z } from 'zod'

import { AppError } from '@/core/errors'
import { logger } from '@/core/logger'

import type { RpcClient } from '../../billing/rpc'
import { clearBillingProfile, saveBillingProfile, type BillingProfile } from './profile'

// The workbench's 开票信息 form (ARCHITECTURE §6.5). `user` is the signed-in account from the
// server session, never from the form; the SQL functions refuse anyone but the org's current owner.

export type BillingError = 'INVALID' | 'NOT_OWNER' | 'FAILED'
export type BillingResult<T> = ({ ok: true } & T) | { ok: false; error: BillingError }
export type BillingDeps = { db: RpcClient; user: string }

export function billingError(error: unknown): BillingError {
  if (error instanceof z.ZodError) return 'INVALID'
  if (error instanceof AppError) {
    if (error.message === 'INVALID_INPUT') return 'INVALID'
    if (error.message === 'NOT_ORG_OWNER') return 'NOT_OWNER'
  }
  logger.error('org billing profile action failed', { code: error instanceof AppError ? error.code : 'UNKNOWN' })
  return 'FAILED'
}

export async function saveBillingCommand(d: BillingDeps, input: unknown): Promise<BillingResult<{ profile: BillingProfile }>> {
  try {
    return { ok: true, profile: await saveBillingProfile(d.db, d.user, input) }
  } catch (error) {
    return { ok: false, error: billingError(error) }
  }
}

export async function clearBillingCommand(d: BillingDeps): Promise<BillingResult<{ cleared: boolean }>> {
  try {
    return { ok: true, cleared: await clearBillingProfile(d.db, d.user) }
  } catch (error) {
    return { ok: false, error: billingError(error) }
  }
}
