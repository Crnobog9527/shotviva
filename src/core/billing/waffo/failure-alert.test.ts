import { describe, expect, it } from 'vitest'

import { refundSucceeded } from '../../../../tests/fakes/waffo'
import { waffoFailureAlert, waffoRefundAlert } from './failure-alert'
import type { WaffoEvent } from './webhook'

const USER = '6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b'

describe('Waffo owner alerts', () => {
  it('reads a failed grant from the order metadata and the charged amount', () => {
    const event = {
      eventType: 'order.completed',
      eventId: 'PAY_1',
      storeId: 's',
      mode: 'test',
      data: { orderId: 'ORD_1', orderMetadata: { user_id: USER, product_id: 'pack_m' }, chargedAmount: '24.90', currency: 'USD' },
    } as WaffoEvent
    expect(waffoFailureAlert(event)).toEqual({
      kind: 'payment_failed',
      channel: 'waffo',
      eventId: 'PAY_1',
      step: 'purchase',
      userId: USER,
      productId: 'pack_m',
      amount: { cents: 2490, currency: 'usd' },
    })
  })

  it('hands a refund over by payment id for the notifier to look up', () => {
    const event = refundSucceeded('PAY_9') as WaffoEvent
    expect(waffoRefundAlert(event)).toMatchObject({ kind: 'refund', channel: 'waffo', refundId: event.eventId, waffoPaymentId: 'PAY_9', userId: null })
  })
})
