import type { Client } from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { handleStripeWebhook } from '@/core/billing/stripe'

import { connectAdmin, createUser, profileOf } from './helpers'
import { chargeObject, checkoutSession, eventFor, paymentsOf, signed, stripeHarness, type Harness } from './stripe-fixtures'

// T73 (ARCHITECTURE §6.1 payments, §6.2, §6.3): the Stripe wallet line (支付宝 / 微信支付) opens
// one Checkout page offering Alipay and WeChat Pay. The session's metadata says `alipay` (the
// wallet line) either way; payments.method records the wallet that actually paid, read from the
// charge, and migration 0560 lets the constraint take `wechat_pay`.

let db: Client
let h: Harness

beforeAll(async () => {
  db = await connectAdmin()
})

afterAll(async () => {
  await db.end()
})

beforeEach(() => {
  h = stripeHarness()
})

const deliver = (event: unknown) => handleStripeWebhook(h.deps, signed(event))

async function payWithWallet(productId: 'pack_s' | 'starter_monthly', wallet: 'alipay' | 'wechat_pay', amount: number) {
  const userId = await createUser(db)
  const charge = chargeObject({ amount, method: wallet })
  h.charges.set(charge.id, charge)
  const session = checkoutSession({ userId, productId, method: 'alipay', charge })
  h.sessions.set(session.id, session)
  expect((await deliver(eventFor('checkout.session.completed', session.id))).body).toMatchObject({ outcome: 'applied' })
  return { userId, charge }
}

describe('支付宝 / 微信支付 wallet line', () => {
  it('a pack paid with WeChat Pay: credits granted, recorded and tracked as wechat_pay', async () => {
    const { userId, charge } = await payWithWallet('pack_s', 'wechat_pay', 990)
    expect(await profileOf(db, userId)).toMatchObject({ credits: 20 })
    expect(await paymentsOf(db, userId)).toEqual([
      expect.objectContaining({ product_id: 'pack_s', stripe_charge_id: charge.id, method: 'wechat_pay', status: 'paid' }),
    ])
    expect(h.trackBuy).toHaveBeenCalledWith(userId, expect.objectContaining({ form: 'one_time', method: 'wechat_pay' }), 'en')
  })

  it('a Starter period paid with WeChat Pay is one payment, recorded as wechat_pay', async () => {
    const { userId } = await payWithWallet('starter_monthly', 'wechat_pay', 1990)
    expect(await profileOf(db, userId)).toMatchObject({ credits: 50 })
    const [payment] = await paymentsOf(db, userId)
    expect(payment).toMatchObject({ product_id: 'starter_monthly', method: 'wechat_pay', stripe_invoice_id: null })
  })

  it('the same wallet line paid with Alipay still records alipay', async () => {
    const { userId } = await payWithWallet('pack_s', 'alipay', 990)
    expect(await paymentsOf(db, userId)).toEqual([expect.objectContaining({ method: 'alipay' })])
    expect(h.trackBuy).toHaveBeenCalledWith(userId, expect.objectContaining({ method: 'alipay' }), 'en')
  })
})

describe('payments_method_check (0560)', () => {
  const insert = (userId: string, method: string) =>
    db.query(
      `insert into public.payments (user_id, product_id, channel, stripe_session_id, amount_total, currency, amount_tax, method)
       values ($1, 'pack_s', 'stripe', $2, 990, 'usd', 0, $3)`,
      [userId, `cs_test_check_${method}_${userId}`, method],
    )

  it('takes every recorded method, wechat_pay included', async () => {
    for (const method of ['card', 'alipay', 'wechat_pay', 'cn_card']) {
      const userId = await createUser(db)
      await expect(insert(userId, method)).resolves.toBeDefined()
    }
  })

  it('still refuses anything else', async () => {
    const userId = await createUser(db)
    await expect(insert(userId, 'wechat')).rejects.toThrow(/payments_method_check/)
  })
})
