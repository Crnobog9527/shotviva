import 'server-only'

import { z } from 'zod'

import { readWaffoGraphql } from '../waffo/client'
import { toCents } from '../waffo/payment-facts'

// F4 (ARCHITECTURE §6.2 订单手续费, F1 §3): Waffo's real fee for one payment (PAY_…) or one refund
// (REF_…), GraphQL `settlementInfo.feeAmount`. It only exists once the item has settled (about ten
// days after it happened; `settlementInfo` is null until then). Read-only.

const money = z.string().regex(/^-?\d{1,9}(\.\d{1,2})?$/)
const settlementSchema = z
  .object({ feeAmount: money, feeCurrency: z.string().min(3), settledAt: z.string().nullable().optional() })
  .nullable()
const itemSchema = z.object({ id: z.string(), settlementInfo: settlementSchema }).nullable()

export type WaffoSettlement = { feeCents: number; currency: string; settledAt: string | null }

// null: not settled yet (or Waffo has no such item).
export type WaffoSettlementApi = {
  payment(paymentId: string): Promise<WaffoSettlement | null>
  refund(refundId: string): Promise<WaffoSettlement | null>
}

const PAYMENT_QUERY = 'query($id:String!){ item: payment(id:$id){ id settlementInfo{ feeAmount feeCurrency settledAt } } }'
const REFUND_QUERY = 'query($id:String!){ item: refund(id:$id){ id settlementInfo{ feeAmount feeCurrency settledAt } } }'

function settlementOf(data: unknown): WaffoSettlement | null {
  const parsed = z.object({ item: itemSchema }).safeParse(data)
  if (!parsed.success) throw new Error('Waffo settlement answered an unexpected shape')
  const info = parsed.data.item?.settlementInfo
  if (!info) return null
  const fee = info.feeAmount.startsWith('-') ? -toCents(info.feeAmount.slice(1)) : toCents(info.feeAmount)
  return { feeCents: fee, currency: info.feeCurrency.toLowerCase(), settledAt: info.settledAt ?? null }
}

export function waffoSettlementApi(request: typeof fetch = fetch): WaffoSettlementApi {
  return {
    payment: async (id) => settlementOf(await readWaffoGraphql(PAYMENT_QUERY, { id }, request)),
    refund: async (id) => settlementOf(await readWaffoGraphql(REFUND_QUERY, { id }, request)),
  }
}
