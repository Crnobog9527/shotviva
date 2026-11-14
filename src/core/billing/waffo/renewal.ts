import 'server-only'

import { z } from 'zod'

import { notifyOwner } from '../../alerts'
import { callRpc, type RpcClient } from '../rpc'
import { toCents, type WaffoOrder } from './payment-facts'

const result = z.object({ outcome: z.enum(['applied', 'replayed', 'review']), ticket_id: z.uuid().optional(), reason: z.enum(['amount_mismatch', 'duplicate_payment']).optional() })

export async function settleQuotedRenewal(db: RpcClient, order: WaffoOrder, paymentId: string, quoted: number) {
  const currency = order.currency?.toLowerCase() ?? null
  const charged = order.chargedAmount === undefined ? null : toCents(order.chargedAmount)
  const tax = toCents(order.listPrice?.taxAmount ?? '0')
  const period = order.periodNumber!
  const { outcome, ticket_id: ticketId, reason } = await callRpc(db, 'settle_waffo_renewal_v2', {
    p_user_id: order.orderMetadata.user_id, p_product_id: order.orderMetadata.product_id,
    p_order_id: order.orderId, p_period: period, p_payment_id: paymentId, p_quoted: quoted,
    p_charged: charged, p_tax: tax, p_currency: currency,
    p_subtotal: order.listPrice?.subtotal === undefined ? null : toCents(order.listPrice.subtotal),
  }, result)
  // Only the transaction that created the ticket schedules an alert, even if R2 is down.
  if (ticketId) notifyOwner({ kind: 'waffo_renewal_review', orderId: order.orderId, period, ticketId, paymentId, duplicate: reason === 'duplicate_payment', quoted, charged, tax, currency })
  return outcome
}
