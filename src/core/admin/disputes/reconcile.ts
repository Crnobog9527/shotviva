import 'server-only'

import { z } from 'zod'

import { callRpc, type RpcClient } from '@/core/billing'
import type { DisputeRow, LiveDispute } from '@/core/billing/stripe'
import { logger } from '@/core/logger'

// Stripe is the record of whether evidence went in (T82, control review of #307): when Stripe shows
// a submission our row lacks (our mark failed after Stripe accepted submit = true, or the Owner
// submitted from the Stripe Dashboard), the admin page records it on sight with its audit row
// (reconcile_dispute_submitted, 0729). Best effort: the page still opens if this fails.

type Pair = { row: DisputeRow; live: LiveDispute | null }

export function needsReconcile({ row, live }: Pair): boolean {
  return row.submitted_at === null && (live?.submissionCount ?? 0) > 0
}

export async function reconcileSubmitted<T extends DisputeRow>(db: RpcClient, row: T, live: LiveDispute | null): Promise<T> {
  if (!needsReconcile({ row, live })) return row
  try {
    const at = await callRpc(db, 'reconcile_dispute_submitted', { p_dispute_id: row.stripe_dispute_id }, z.string().nullable())
    return { ...row, submitted_at: at ? new Date(at) : new Date() }
  } catch (error) {
    logger.error('admin.disputes.reconcile_failed', { dispute_id: row.stripe_dispute_id, error })
    return row
  }
}
