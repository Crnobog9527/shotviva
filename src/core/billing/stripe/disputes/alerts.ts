import 'server-only'

import { captureAlert } from '../../../analytics/capture-error'
import { formatAmount, formatDeadline, REASON_ZH } from './labels'

// Owner alerts for disputes (T82), in plain Chinese with the deadline and the admin link.
// T72 hook: when core/alerts (PR #276) is on main, send the same `text` with
// notifyOwner({ kind: 'dispute_opened' | 'dispute_due_soon', ... }) next to each captureAlert
// below; the Sentry alert stays as the fallback. Fields carry ids only, never the email.

export type DisputeAlertFacts = {
  disputeId: string
  amount: number
  currency: string
  reason: string
  dueBy: Date | null
  responder: 'shotviva' | 'stripe'
  autoBanned: boolean
  userId: string | null
  adminUrl: string
}

const WHO: Record<DisputeAlertFacts['responder'], string> = {
  shotviva: '需要你在后台检查证据后点「提交申诉」',
  stripe: '这笔走 Managed Payments，由 Stripe 应诉，证据草稿已存给 Stripe 参考，不用提交',
}

export function disputeOpenedText(f: DisputeAlertFacts): string {
  const ban = f.autoBanned ? '账号已自动封禁。' : '账号没有自动封禁（管理员或已封禁）。'
  return `收到一笔拒付：${formatAmount(f.amount, f.currency)}，原因「${REASON_ZH[f.reason] ?? f.reason}」，截止 ${formatDeadline(f.dueBy)}。${ban}证据草稿已整理好，${WHO[f.responder]}。后台：${f.adminUrl}`
}

export function disputeDueSoonText(f: DisputeAlertFacts): string {
  return `拒付申诉快到期了：${formatAmount(f.amount, f.currency)}，截止 ${formatDeadline(f.dueBy)}，证据还没提交。后台：${f.adminUrl}`
}

const fields = (f: DisputeAlertFacts) => ({
  dispute_id: f.disputeId,
  user_id: f.userId,
  amount: f.amount,
  currency: f.currency,
  reason: f.reason,
  responder: f.responder,
  due_by: f.dueBy?.toISOString() ?? null,
  auto_banned: f.autoBanned,
})

export function alertDisputeOpened(f: DisputeAlertFacts): void {
  captureAlert('dispute_opened', disputeOpenedText(f), { fields: fields(f) })
}

export function alertDisputeDueSoon(f: DisputeAlertFacts): void {
  captureAlert('dispute_due_soon', disputeDueSoonText(f), { fields: fields(f) })
}
