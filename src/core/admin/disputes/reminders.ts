import 'server-only'

import { z } from 'zod'

import { callRpc, type RpcClient } from '@/core/billing'
import { alertDisputeDueSoon } from '@/core/billing/stripe'
import { logger } from '@/core/logger'

import type { DisputeListItem } from './repository'

// 「截止前 3 天还没提交，飞书再提醒一次」 (ARCHITECTURE §6.3, T82): checked when the admin
// list opens, no scheduled job. Candidates are disputes we answer that Stripe still says need a
// response; claim_dispute_reminders (0729) marks each once, atomically, so two page loads alert
// once. Disputes due soon were opened recently, so they sit on the first page.
const REMIND_WITHIN_MS = 3 * 24 * 60 * 60 * 1000

export function reminderCandidates(items: readonly DisputeListItem[], now: Date): string[] {
  return items
    .filter((item) => item.responder === 'shotviva' && !item.submitted_at && !item.reminded_at)
    .filter((item) => item.live?.open && item.live.dueBy && item.live.dueBy.getTime() - now.getTime() <= REMIND_WITHIN_MS)
    .map((item) => item.stripe_dispute_id)
}

export async function sendDueReminders(db: RpcClient, items: readonly DisputeListItem[], now = new Date()): Promise<void> {
  const ids = reminderCandidates(items, now)
  if (ids.length === 0) return
  try {
    const claimed = new Set(await callRpc(db, 'claim_dispute_reminders', { p_dispute_ids: ids }, z.array(z.string())))
    for (const item of items.filter((i) => claimed.has(i.stripe_dispute_id))) {
      const dueBy = item.live?.dueBy ?? item.due_by
      if (!dueBy) continue
      alertDisputeDueSoon({
        disputeId: item.stripe_dispute_id,
        amount: item.amount,
        currency: item.currency,
        reason: item.reason,
        dueBy,
        responder: item.responder,
        autoBanned: item.auto_banned_at !== null,
        userId: item.user_id,
        productId: item.product_id,
      })
    }
  } catch (error) {
    // The page must still open; the next visit tries again.
    logger.error('admin.disputes.reminder_failed', { error })
  }
}
