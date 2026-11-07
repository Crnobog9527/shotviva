import { formatAmount, formatDeadline, REASON_ZH, STATUS_ZH, type FileField, type TextField } from '@/core/billing/stripe'

import { DISPUTES_COPY as COPY } from '../disputes/copy'
import type { DisputeListItem } from '../disputes/repository'

// Display strings for one dispute (T82). Pure: the client parts receive these, never the
// server-only Stripe folder.

export const TEXT_LABELS: Record<TextField, string> = {
  uncategorized_text: '总结',
  product_description: '产品说明',
  access_activity_log: '账号活动记录（时间、IP、出图、下载）',
  refund_policy_disclosure: '退款政策与同意条款记录',
  refund_refusal_explanation: '不予退款的理由',
  cancellation_policy_disclosure: '取消订阅的规则',
  customer_email_address: '用户邮箱',
  customer_name: '持卡人姓名',
  customer_purchase_ip: '付款 IP',
  service_date: '服务日期',
}

export const FILE_LABELS: Record<FileField, string> = {
  receipt: '收据',
  service_documentation: '服务记录（如作品截图）',
  customer_communication: '和用户的沟通记录',
  uncategorized_file: '其他文件',
}

export type StatusTone = 'urgent' | 'waiting' | 'done' | 'lost'

export type DisputeCard = {
  id: string
  amount: string
  reason: string
  user: string
  userId: string | null
  status: string
  tone: StatusTone
  // Shown only while Stripe still takes evidence; a closed or submitted one shows when it came in.
  due: string | null
  daysLeft: string | null
  received: string
  responder: string
  banned: boolean
  drafted: boolean
}

const DAY_MS = 24 * 60 * 60 * 1000

function tone(item: DisputeListItem): StatusTone {
  const status = item.live?.status
  if (status === 'won' || status === 'warning_closed' || status === 'prevented') return 'done'
  if (status === 'lost') return 'lost'
  if (item.live?.open && item.responder === 'shotviva' && !item.submitted_at) return 'urgent'
  return 'waiting'
}

export function daysLeft(dueBy: Date | null, now: Date): string | null {
  if (!dueBy) return null
  const days = Math.ceil((dueBy.getTime() - now.getTime()) / DAY_MS)
  if (days < 0) return '已过期'
  return days === 0 ? '今天截止' : `还剩 ${days} 天`
}

function statusLabel(item: DisputeListItem): string {
  if (!item.live) return item.submitted_at ? COPY.submittedTag : '—'
  // Managed Payments: Stripe answers, so 「待提交证据」 would read as the Owner's to-do.
  if (item.responder === 'stripe' && item.live.open) return COPY.stripeHandling
  return STATUS_ZH[item.live.status] ?? item.live.status
}

const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000
const beijing = (at: Date) => new Date(at.getTime() + BEIJING_OFFSET_MS).toISOString().slice(0, 16).replace('T', ' ')

function userLabel(item: DisputeListItem): string {
  if (item.email) return item.email
  return item.user_id ? item.user_id.slice(0, 8) : COPY.unknownUser
}

export function toCard(item: DisputeListItem, now: Date): DisputeCard {
  const dueBy = item.live?.dueBy ?? item.due_by
  return {
    id: item.stripe_dispute_id,
    amount: formatAmount(item.amount, item.currency),
    reason: REASON_ZH[item.reason] ?? item.reason,
    user: userLabel(item),
    userId: item.user_id,
    status: statusLabel(item),
    tone: tone(item),
    due: item.live?.open ? formatDeadline(dueBy) : null,
    daysLeft: item.live?.open ? daysLeft(dueBy, now) : null,
    received: beijing(item.created_at),
    responder: COPY.responder[item.responder],
    banned: item.auto_banned_at !== null,
    drafted: item.evidence_drafted_at !== null,
  }
}
