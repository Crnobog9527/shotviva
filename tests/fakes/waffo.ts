import { generateKeyPairSync, randomUUID, sign, type KeyObject } from 'node:crypto'

// Signed fake Waffo webhooks (AGENTS §7 test 2): a throwaway RSA key pair stands in for
// Waffo's, and the signature is made exactly as docs.waffo.ai describes it
// (RSA-SHA256 over `${t}.${rawBody}`, header `t=<ms>,v1=<base64>`), so the real verifier runs.

export const WAFFO_STORE = 'STO_testStore1'

export function waffoKeys(): { publicKey: KeyObject; privateKey: KeyObject } {
  return generateKeyPairSync('rsa', { modulusLength: 2048 })
}

export function signWaffo(body: string, privateKey: KeyObject, t = Date.now()): string {
  const signature = sign('sha256', Buffer.from(`${t}.${body}`), privateKey).toString('base64')
  return `t=${t},v1=${signature}`
}

export const paymentId = () => `PAY_${randomUUID().replaceAll('-', '').slice(0, 22)}`

type OrderInput = {
  userId: string
  productId: string
  eventId?: string
  method?: 'card' | 'alipay'
  paymentStatus?: string
  metadata?: unknown
  storeId?: string
  mode?: 'test' | 'prod'
}

// order.completed as documented: eventId is the payment id; orderMetadata is what checkout set.
export function orderCompleted(input: OrderInput) {
  const id = input.eventId ?? paymentId()
  return {
    id,
    timestamp: new Date().toISOString(),
    eventType: 'order.completed',
    eventId: id,
    storeId: input.storeId ?? WAFFO_STORE,
    storeName: 'Shotviva test',
    mode: input.mode ?? 'test',
    data: {
      orderId: `ORD_${randomUUID().replaceAll('-', '').slice(0, 22)}`,
      orderStatus: 'completed',
      currency: 'USD',
      orderMetadata: input.metadata ?? { user_id: input.userId, product_id: input.productId, method: 'card' },
      orderMerchantExternalId: randomUUID(),
      listPrice: { total: '21.49', subtotal: '19.90', taxAmount: '1.59' },
      chargedAmount: '21.49',
      paymentId: id,
      paymentStatus: input.paymentStatus ?? 'succeeded',
      paymentMethod: input.method === 'alipay' ? 'ewallet' : 'card',
      paymentMethodBrand: input.method === 'alipay' ? 'alipay' : 'visa',
    },
  }
}

export function refundSucceeded(paymentOf: string) {
  const id = `REF_${randomUUID().replaceAll('-', '').slice(0, 22)}`
  return {
    id,
    timestamp: new Date().toISOString(),
    eventType: 'refund.succeeded',
    eventId: id,
    storeId: WAFFO_STORE,
    storeName: 'Shotviva test',
    mode: 'test',
    data: { orderId: 'ORD_x', paymentId: paymentOf, refundStatus: 'succeeded', orderMetadata: {} },
  }
}

// subscription.payment_succeeded (T50): a card subscription's charge, first or renewal. Same
// payment fields as order.completed; eventId is the payment id.
export function subscriptionPaid(input: OrderInput & { orderId?: string; periodNumber?: number }) {
  const event = orderCompleted(input)
  // A pure payment event: no orderStatus or period on it.
  const data: Record<string, unknown> = { ...event.data, orderId: input.orderId ?? event.data.orderId, periodNumber: input.periodNumber ?? 1 }
  delete data.orderStatus
  return { ...event, eventType: 'subscription.payment_succeeded', data }
}

// subscription.activated / renewed / canceling / past_due / canceled …: no payment fields; the
// order, its status and the current period.
export function subscriptionState(input: {
  userId: string
  productId: string
  orderId: string
  eventType: string
  orderStatus: string
  currentPeriodEnd?: string
  timestamp?: string
}) {
  const timestamp = input.timestamp ?? new Date().toISOString()
  return {
    id: input.orderId,
    timestamp,
    eventType: input.eventType,
    eventId: `${input.orderId}-${timestamp}`,
    storeId: WAFFO_STORE,
    storeName: 'Shotviva test',
    mode: 'test',
    data: {
      orderId: input.orderId,
      orderStatus: input.orderStatus,
      currency: 'USD',
      orderMetadata: { user_id: input.userId, product_id: input.productId, method: 'card' },
      billingPeriod: input.productId.endsWith('yearly') ? 'yearly' : 'monthly',
      ...(input.currentPeriodEnd ? { currentPeriodEnd: input.currentPeriodEnd } : {}),
    },
  }
}
