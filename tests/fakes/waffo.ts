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
