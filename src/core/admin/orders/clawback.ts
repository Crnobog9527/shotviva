import 'server-only'

import { z } from 'zod'

import { AppError } from '@/core/errors'
import { callRpc, type RpcClient } from '@/core/billing/rpc'

// 「扣回这笔付款的剩余积分」 (ARCHITECTURE §6.2 「人工审核」, §10, T71): before a pro-rata refund of a
// purchase whose credits were partly used, the Owner takes back what the user still has of it,
// booked on the payment so the refund callback that follows does not take it again. Preview first
// (the confirm dialog states the number), then one call to admin_clawback_payment, which re-checks
// the admin and computes the amount again under a lock. Nothing here moves money.

export type ClawbackPreview = {
  paymentId: string
  productId: string
  granted: number
  clawedBack: number
  shortfall: number
  balance: number
  // What a clawback would take now: least(paid balance, granted − settled).
  available: number
}

export type ClawbackResult = { taken: number; clawedBack: number; shortfall: number }

const paymentId = z.string().regex(/^\d{1,18}$/)

const previewSchema = z.object({
  payment_id: z.number().int(),
  product_id: z.string(),
  granted: z.number().int(),
  credits_clawed_back: z.number().int(),
  clawback_shortfall: z.number().int(),
  balance: z.number().int(),
  available: z.number().int(),
})

const resultSchema = z.object({ taken: z.number().int(), credits_clawed_back: z.number().int(), clawback_shortfall: z.number().int() })

function parseId(id: unknown): number {
  const parsed = paymentId.safeParse(id)
  if (!parsed.success) throw new AppError('INVALID_INPUT', 'payment id')
  return Number(parsed.data)
}

export async function previewClawback(db: RpcClient, id: unknown): Promise<ClawbackPreview> {
  const row = await callRpc(db, 'payment_clawback_preview', { p_payment_id: parseId(id) }, previewSchema)
  return {
    paymentId: String(row.payment_id),
    productId: row.product_id,
    granted: row.granted,
    clawedBack: row.credits_clawed_back,
    shortfall: row.clawback_shortfall,
    balance: row.balance,
    available: row.available,
  }
}

export async function applyClawback(db: RpcClient, id: unknown, actorId: string): Promise<ClawbackResult> {
  const row = await callRpc(db, 'admin_clawback_payment', { p_payment_id: parseId(id), p_actor: actorId }, resultSchema)
  return { taken: row.taken, clawedBack: row.credits_clawed_back, shortfall: row.clawback_shortfall }
}
