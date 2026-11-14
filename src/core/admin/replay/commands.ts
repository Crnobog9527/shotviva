import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

import { callRpc } from '@/core/billing'
import { applyReplay, previewReplay, REPLAY_ERRORS, type FulfilDeps, type ReplayOutcome, type ReplayPreview } from '@/core/billing/stripe'
import { AppError, toAppError } from '@/core/errors'
import { logger } from '@/core/logger'

import { REPLAY_COPY } from '../replay-ui/copy'

// /admin/orders 「按 Stripe id 重放入账」 (ARCHITECTURE §10, T26). The money path is
// core/billing/stripe/replay.ts; this layer turns its errors into Chinese and writes the
// replay_checkout audit row. Settling and auditing are two calls, the documented AGENTS §5.1
// exception for admin replay (spec #90): settle_checkout is idempotent on its own, and a failed
// audit write is logged, never allowed to look like a failed replay.

export type ReplayDeps = FulfilDeps & { admin: SupabaseClient }

// Stripe's SDK throws resource_missing for an unknown id (or one from the other mode).
const missing = (error: unknown) => typeof error === 'object' && error !== null && 'code' in error && error.code === 'resource_missing'

function friendly(error: unknown): never {
  if (missing(error)) throw new AppError('NOT_FOUND', REPLAY_COPY.errors.notFound)
  const appError = toAppError(error)
  if (appError.message === REPLAY_ERRORS.format) throw new AppError('INVALID_INPUT', REPLAY_COPY.errors.format)
  if (appError.message === REPLAY_ERRORS.unpaid) throw new AppError('CONFLICT', REPLAY_COPY.errors.unpaid)
  if (appError.code === 'INVALID_INPUT') throw new AppError('INVALID_INPUT', REPLAY_COPY.errors.mismatch)
  throw appError
}

export async function previewStripeReplay(deps: ReplayDeps, id: unknown): Promise<ReplayPreview> {
  return previewReplay(deps, id).catch(friendly)
}

async function audit(admin: SupabaseClient, preview: ReplayPreview, outcome: ReplayOutcome): Promise<void> {
  try {
    await callRpc(admin, 'admin_log_replay', { p_user_id: preview.userId, p_target_id: preview.id, p_reason: REPLAY_COPY.auditReason(outcome) }, z.unknown())
  } catch (error) {
    logger.error('admin.replay.audit_failed', { target: preview.id, outcome, error })
  }
}

export async function applyStripeReplay(deps: ReplayDeps, id: unknown): Promise<{ preview: ReplayPreview; outcome: ReplayOutcome }> {
  const result = await applyReplay(deps, id).catch(friendly)
  await audit(deps.admin, result.preview, result.outcome)
  return result
}
