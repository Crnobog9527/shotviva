import type Stripe from 'stripe'
import { describe, expect, it, vi } from 'vitest'

import type { FeeTarget } from './record'
import { recordStripeFees, stripeFeeWrite } from './stripe'

// F3 (ARCHITECTURE §6.2 订单手续费): what the Stripe side hands payment_fee_record, built from
// balance transactions shaped like F1's test-mode measurements. The split itself (residual on
// the acquiring line) runs in SQL: tests/db/payment-fee-webhook.test.ts.

const rates = {
  acquiring: { id: 1, rate_bp: 290, fixed_cents: 30 },
  intl_card: { id: 2, rate_bp: 150, fixed_cents: 0 },
  fx: { id: 3, rate_bp: 100, fixed_cents: 0 },
  mp: { id: 4, rate_bp: 350, fixed_cents: 0 },
  billing: { id: 5, rate_bp: 70, fixed_cents: 0 },
  radar: { id: 6, rate_bp: 0, fixed_cents: 5 },
}
const target = (method: string, extra: Partial<FeeTarget> = {}): FeeTarget => ({
  payment_id: 7, channel: 'stripe', method, currency: 'usd', amount_total: 990, recordable: true,
  schedules: method === 'alipay' ? { acquiring: rates.acquiring, fx: rates.fx, radar: rates.radar } : rates, ...extra,
})

type Detail = { type: string; amount: number; description?: string }
function charge(bt: { amount: number; details: Detail[]; exchangeRate?: number; currency?: string } | null, country?: string): Stripe.Charge {
  return {
    id: 'ch_1',
    payment_method_details: { type: 'card', card: country ? { country } : {} },
    balance_transaction: bt && {
      id: 'txn_1', amount: bt.amount, currency: bt.currency ?? 'usd', exchange_rate: bt.exchangeRate ?? null,
      fee: bt.details.reduce((s, d) => s + d.amount, 0),
      fee_details: bt.details.map(d => ({ currency: 'usd', application: null, description: d.description ?? null, ...d })),
    },
  } as unknown as Stripe.Charge
}
const oneTime = { subscription: false, managedPayments: null }
const kinds = (lines: { kind: string; source: string }[]) => lines.map(l => `${l.kind}:${l.source}`)

describe('stripeFeeWrite', () => {
  it('a 中国银行卡 $9.90: the real 74¢ split into acquiring and the international surcharge, plus Radar', () => {
    const write = stripeFeeWrite(target('cn_card'), charge({ amount: 990, details: [{ type: 'stripe_fee', amount: 74 }] }, 'CN'), oneTime)
    expect(write).toMatchObject({ payment_id: 7, idempotency_key: 'stripe_bt:txn_1', basis_cents: 990, actual_cents: 74 })
    expect(write?.lines).toEqual([
      { kind: 'intl_card', source: 'stripe_bt', schedule_id: 2, source_ref: 'txn_1' },
      { kind: 'acquiring', source: 'stripe_bt', schedule_id: 1, source_ref: 'txn_1' },
      { kind: 'radar', source: 'formula', schedule_id: 6, source_ref: 'ch_1' },
    ])
  })

  it('a ¥72 charge: Stripe’s own conversion detail becomes the FX line with its amount', () => {
    const details = [{ type: 'stripe_fee', amount: 11, description: 'Stripe currency conversion fee' }, { type: 'stripe_fee', amount: 77, description: 'Stripe processing fees' }]
    const write = stripeFeeWrite(target('cn_card'), charge({ amount: 1078, details, exchangeRate: 0.149765 }, 'CN'), oneTime)
    expect(write).toMatchObject({ basis_cents: 1078, actual_cents: 88 })
    expect(write?.lines[0]).toEqual({ kind: 'fx', source: 'stripe_bt', schedule_id: 3, amount_cents: 11, source_ref: 'txn_1' })
    expect(kinds(write!.lines)).toEqual(['fx:stripe_bt', 'intl_card:stripe_bt', 'acquiring:stripe_bt', 'radar:formula'])
  })

  it('Managed Payments: withheld tax is never a fee; MP 3.5% and Billing 0.7% are formula lines, no Radar', () => {
    const details = [{ type: 'withheld_tax', amount: 250, description: 'Withheld sales tax' }, { type: 'stripe_fee', amount: 182 }]
    const write = stripeFeeWrite(target('card'), charge({ amount: 5240, details }, 'US'), { subscription: true, managedPayments: null })
    expect(write).toMatchObject({ basis_cents: 5240, actual_cents: 182 })
    expect(kinds(write!.lines)).toEqual(['acquiring:stripe_bt', 'mp:formula', 'billing:formula'])
  })

  it('the session’s managed_payments flag marks MP even when no tax entry is present', () => {
    const write = stripeFeeWrite(target('card'), charge({ amount: 990, details: [{ type: 'stripe_fee', amount: 59 }] }, 'US'), { subscription: false, managedPayments: true })
    expect(kinds(write!.lines)).toEqual(['acquiring:stripe_bt', 'mp:formula'])
  })

  it('a card shows the surcharge only when the bill carries it', () => {
    const domestic = stripeFeeWrite(target('card'), charge({ amount: 990, details: [{ type: 'stripe_fee', amount: 59 }] }), oneTime)
    expect(kinds(domestic!.lines)).toEqual(['acquiring:stripe_bt', 'radar:formula'])
    const foreign = stripeFeeWrite(target('card'), charge({ amount: 990, details: [{ type: 'stripe_fee', amount: 74 }] }, 'DE'), oneTime)
    expect(kinds(foreign!.lines)).toEqual(['intl_card:stripe_bt', 'acquiring:stripe_bt', 'radar:formula'])
    const usButHigh = stripeFeeWrite(target('card'), charge({ amount: 990, details: [{ type: 'stripe_fee', amount: 74 }] }, 'US'), oneTime)
    expect(kinds(usButHigh!.lines)).toEqual(['acquiring:stripe_bt', 'radar:formula'])
  })

  it('a wallet pays no card surcharge, even with a high bill', () => {
    const write = stripeFeeWrite(target('alipay'), charge({ amount: 1990, details: [{ type: 'stripe_fee', amount: 88 }] }), oneTime)
    expect(kinds(write!.lines)).toEqual(['acquiring:stripe_bt', 'radar:formula'])
  })

  it('no balance transaction yet: published-rate estimates on the USD amount charged', () => {
    const write = stripeFeeWrite(target('cn_card', { amount_total: 2490 }), charge(null), { subscription: true, managedPayments: null })
    expect(write).toEqual({
      payment_id: 7, idempotency_key: 'estimate:7', basis_cents: 2490,
      lines: [
        { kind: 'acquiring', source: 'estimate', schedule_id: 1 },
        { kind: 'intl_card', source: 'estimate', schedule_id: 2 },
        { kind: 'billing', source: 'formula', schedule_id: 5, source_ref: 'ch_1' },
        { kind: 'radar', source: 'formula', schedule_id: 6, source_ref: 'ch_1' },
      ],
    })
  })

  it('writes nothing it cannot state in USD', () => {
    expect(stripeFeeWrite(target('cn_card', { currency: 'cny' }), charge(null), oneTime)).toBeNull()
    expect(stripeFeeWrite(target('cn_card', { currency: 'cny' }), charge({ amount: 990, details: [], currency: 'eur' }), oneTime)).toBeNull()
  })
})

describe('recordStripeFees', () => {
  const recorded = { data: { applied: true, revision: 1, fee_cents: 79, fee_status: 'estimated' }, error: null }
  const deps = (rpc: (fn: string) => Promise<unknown>) => {
    const retrieve = vi.fn(async () => charge({ amount: 990, details: [{ type: 'stripe_fee', amount: 74 }] }, 'CN'))
    return { retrieve, deps: { db: { rpc: vi.fn(rpc) } as never, stripe: { charges: { retrieve } } as never } }
  }

  it('before record_from it reads the gate once and never calls Stripe', async () => {
    const { retrieve, deps: d } = deps(async () => ({ data: { ...target('cn_card'), recordable: false }, error: null }))
    expect(await recordStripeFees(d, { ref: 'in_1', chargeId: 'ch_1', subscription: true, managedPayments: null })).toBe('legacy')
    expect(retrieve).not.toHaveBeenCalled()
  })

  it('an invoice’s charge is read again with its balance transaction', async () => {
    const { retrieve, deps: d } = deps(async (fn) => fn === 'payment_fee_target' ? { data: target('cn_card'), error: null } : recorded)
    expect(await recordStripeFees(d, { ref: 'in_1', chargeId: 'ch_1', subscription: true, managedPayments: null })).toBe('recorded')
    expect(retrieve).toHaveBeenCalledWith('ch_1', { expand: ['balance_transaction'] })
  })

  it('a session’s expanded charge is used as it is', async () => {
    const { retrieve, deps: d } = deps(async (fn) => fn === 'payment_fee_target' ? { data: target('cn_card'), error: null } : recorded)
    const own = charge({ amount: 990, details: [{ type: 'stripe_fee', amount: 74 }] }, 'CN')
    expect(await recordStripeFees(d, { ref: 'cs_1', chargeId: 'ch_1', charge: own, subscription: false, managedPayments: null })).toBe('recorded')
    expect(retrieve).not.toHaveBeenCalled()
  })

  it('never throws: a database or Stripe failure is logged and left for the reconciliation', async () => {
    const { deps: d } = deps(async () => ({ data: null, error: { message: 'boom' } }))
    expect(await recordStripeFees(d, { ref: 'cs_1', chargeId: null, subscription: false, managedPayments: null })).toBe('failed')
    const broken = deps(async () => ({ data: target('cn_card'), error: null }))
    broken.retrieve.mockRejectedValueOnce(new Error('stripe down'))
    expect(await recordStripeFees(broken.deps, { ref: 'in_1', chargeId: 'ch_1', subscription: true, managedPayments: null })).toBe('failed')
  })

  it('reports a replay as such', async () => {
    const { deps: d } = deps(async (fn) => fn === 'payment_fee_target'
      ? { data: target('cn_card'), error: null }
      : { data: { applied: false, reason: 'replayed', revision: 1, fee_cents: 79, fee_status: 'estimated' }, error: null })
    expect(await recordStripeFees(d, { ref: 'in_1', chargeId: 'ch_1', subscription: true, managedPayments: null })).toBe('replayed')
  })
})
