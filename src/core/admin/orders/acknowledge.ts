import 'server-only'

import { z } from 'zod'

import { AppError } from '@/core/errors'
import { callRpc, type RpcClient } from '@/core/billing/rpc'

// 「标记已知晓」 on a refunded or disputed payment (ARCHITECTURE §10, 1881/1882): the payment leaves
// the overview counter 「退款和争议（60 天内）」 until its status or refunded amount changes; an
// open dispute keeps counting until it closes. Only the mark and an audit row are written:
// nothing here touches money, refunds or clawbacks.

export type AcknowledgeResult = { changed: boolean; acknowledgedAt: string | null }

const paymentId = z.string().regex(/^\d{1,18}$/)
const resultSchema = z.object({ changed: z.boolean(), acknowledged_at: z.string().nullable() })
const idsSchema = z.array(z.union([z.number(), z.string()]).transform(String))

function parseId(id: unknown): number {
  const parsed = paymentId.safeParse(id)
  if (!parsed.success) throw new AppError('INVALID_INPUT', 'payment id')
  return Number(parsed.data)
}

async function call(db: RpcClient, fn: string, id: unknown, actorId: string): Promise<AcknowledgeResult> {
  const row = await callRpc(db, fn, { p_payment_id: parseId(id), p_actor: actorId }, resultSchema)
  return { changed: row.changed, acknowledgedAt: row.acknowledged_at }
}

export const acknowledgePayment = (db: RpcClient, id: unknown, actorId: string) => call(db, 'admin_acknowledge_payment', id, actorId)

export const unacknowledgePayment = (db: RpcClient, id: unknown, actorId: string) => call(db, 'admin_unacknowledge_payment', id, actorId)

// The payments the counter counts, newest first (admin_attention_payment_ids, 1882).
export async function loadAttentionIds(db: RpcClient): Promise<string[]> {
  return callRpc(db, 'admin_attention_payment_ids', {}, idsSchema)
}
