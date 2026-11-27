import { describe, expect, it } from 'vitest'

import { alertPolicy, type OwnerAlert } from './alert-kinds'
import { renderAlert } from './templates'

// F4: the reconciliation's one message per run.
const alert: OwnerAlert = {
  kind: 'payment_fee_reconcile',
  fingerprint: 'abc123',
  issues: [
    { issue: 'unreconciled', channel: 'waffo', ref: '41', fee: 'acquiring', estimateCents: null, actualCents: null, days: 15 },
    { issue: 'mismatch', channel: 'waffo', ref: '42', fee: 'acquiring', estimateCents: 89, actualCents: 120, days: null },
    { issue: 'batch_mismatch', channel: 'stripe', ref: 'txn_1', fee: 'mp', estimateCents: 104, actualCents: 140, days: null },
    { issue: 'batch_unknown', channel: 'stripe', ref: 'txn_2', fee: null, estimateCents: null, actualCents: 70, days: null },
  ],
}

describe('payment_fee_reconcile alert', () => {
  it('says what was found in plain Chinese, with examples and the admin link', () => {
    const { sentence, link } = renderAlert(alert, { who: null, origin: 'https://shotviva.com', testSite: false })
    expect(sentence).toBe(
      '【手续费对账】1 笔超时还没拿到真实手续费，1 笔真实手续费和预估差得多，1 条 Stripe 批量扣费对不上付款，1 条 Stripe 扣费类型不认识。' +
      '例如：Waffo 付款 #41 已 15 天还没对上真实收单费；Waffo 付款 #42 收单费预估 $0.89、实际 $1.20；' +
      'Stripe 批量扣费 $1.40（Managed Payments 3.5%）对不上当天的付款（按费率算 $1.04）；Stripe 有一笔不认识的扣费 $0.70。' +
      '付款不受影响；佣金先按预估费用，确认期满后再等最多 14 天。请到后台联盟页核对。',
    )
    expect(link).toContain('https://shotviva.com/admin/affiliates')
  })
  it('is sent once per set of findings', () => {
    expect(alertPolicy(alert)).toEqual({ key: 'payment_fee_reconcile:abc123', money: false })
  })
})
