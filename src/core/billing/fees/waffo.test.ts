import { describe, expect, it, vi } from 'vitest'

import type { FeeTarget } from './record'
import { recordWaffoFees, recordWaffoRefundFee, waffoChargeWrite, waffoRefundWrite } from './waffo'

// F3 (ARCHITECTURE §6.2 订单手续费): Waffo charges and card refunds carry published-rate estimates
// until the settlement figure (F4). Amounts are priced in SQL from the schedule.

const card = { acquiring: { id: 11, rate_bp: 390, fixed_cents: 50 }, refund_fee: { id: 12, rate_bp: 0, fixed_cents: 100 } }
const target = (method: string, schedules: FeeTarget['schedules'], extra: Partial<FeeTarget> = {}): FeeTarget => ({
  payment_id: 9, channel: 'waffo', method, currency: 'usd', amount_total: 2149, recordable: true, schedules, ...extra,
})

describe('waffoChargeWrite', () => {
  it('one estimated acquiring line on the tax-inclusive amount, keyed by the payment', () => {
    expect(waffoChargeWrite(target('card', card), 'PAY_1')).toEqual({
      payment_id: 9, idempotency_key: 'estimate:9', basis_cents: 2149,
      lines: [{ kind: 'acquiring', source: 'estimate', schedule_id: 11, source_ref: 'PAY_1' }],
    })
    expect(waffoChargeWrite(target('wechat_pay', { acquiring: { id: 13, rate_bp: 390, fixed_cents: 0 } }), 'PAY_2')?.lines)
      .toEqual([{ kind: 'acquiring', source: 'estimate', schedule_id: 13, source_ref: 'PAY_2' }])
  })

  it('nothing without a rate or a USD amount', () => {
    expect(waffoChargeWrite(target('card', {}), 'PAY_1')).toBeNull()
    expect(waffoChargeWrite(target('card', card, { currency: 'eur' }), 'PAY_1')).toBeNull()
  })
})

describe('waffoRefundWrite', () => {
  it('a card refund: the $1 refund fee on the refund’s own scope', () => {
    expect(waffoRefundWrite(target('card', card), 'REF_1', 500)).toEqual({
      payment_id: 9, idempotency_key: 'estimate:refund:REF_1', refund_id: 'REF_1', basis_cents: 500,
      lines: [{ kind: 'refund_fee', source: 'estimate', schedule_id: 12, source_ref: 'REF_1' }],
    })
    expect(waffoRefundWrite(target('card', card), 'REF_2', null)?.basis_cents).toBe(2149)
  })

  it('a wallet refund has no published fee', () => {
    expect(waffoRefundWrite(target('alipay', { acquiring: { id: 14, rate_bp: 390, fixed_cents: 0 } }), 'REF_1', 500)).toBeNull()
  })
})

describe('recordWaffoFees / recordWaffoRefundFee', () => {
  it('before record_from: the gate is read and nothing is written', async () => {
    const rpc = vi.fn<(fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: null }>>(async () => ({ data: { ...target('card', card), recordable: false }, error: null }))
    expect(await recordWaffoFees({ rpc }, 'PAY_1')).toBe('legacy')
    expect(await recordWaffoRefundFee({ rpc }, { paymentId: 9, refundRef: 'REF_1', refundCents: 500 })).toBe('legacy')
    expect(rpc.mock.calls.map(([fn]) => fn)).toEqual(['payment_fee_target', 'payment_fee_target'])
    expect(rpc).toHaveBeenNthCalledWith(1, 'payment_fee_target', { p_payment_id: null, p_ref: 'PAY_1' })
    expect(rpc).toHaveBeenNthCalledWith(2, 'payment_fee_target', { p_payment_id: 9, p_ref: null })
  })

  it('writes through payment_fee_record, and a missing row or a failure never throws', async () => {
    const rpc = vi.fn(async (fn: string) => fn === 'payment_fee_target'
      ? { data: target('card', card), error: null }
      : { data: { applied: true, revision: 1, fee_cents: 134, fee_status: 'estimated' }, error: null })
    expect(await recordWaffoFees({ rpc }, 'PAY_1')).toBe('recorded')
    expect(rpc).toHaveBeenLastCalledWith('payment_fee_record', { p_input: expect.objectContaining({ idempotency_key: 'estimate:9' }) })
    expect(await recordWaffoFees({ rpc: async () => ({ data: null, error: null }) }, 'PAY_1')).toBe('skipped')
    expect(await recordWaffoFees({ rpc: async () => { throw new Error('db down') } }, 'PAY_1')).toBe('failed')
  })
})
