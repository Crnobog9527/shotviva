import { describe, expect, it } from 'vitest'

import { ORDERS_COPY } from './copy'

// T64: /admin/orders tells the Managed Payments card from the plain Stripe card (中国银行卡).
describe('orders method labels', () => {
  it('names each recorded method, the two card routes apart', () => {
    const { methods } = ORDERS_COPY
    expect(Object.keys(methods).sort()).toEqual(['alipay', 'card', 'cn_card', 'wechat_pay'])
    expect(methods.wechat_pay).toBe('微信支付')
    expect(methods.card).not.toBe(methods.cn_card)
    expect(methods.cn_card).toContain('中国银行卡')
  })
})
