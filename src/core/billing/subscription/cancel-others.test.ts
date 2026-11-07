import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { MirrorRow } from './summary'

const mocks = vi.hoisted(() => ({ mirror: vi.fn(), alert: vi.fn() }))
vi.mock('./read-summary', () => ({ readMirrorRows: mocks.mirror }))
vi.mock('../../analytics/capture-error', () => ({ captureAlert: mocks.alert }))

const { cancelOtherSubscriptions } = await import('./cancel-others')

// The upgrade's cancel step (ARCHITECTURE §6.2 「升级」, T66): every other renewing subscription
// is cancelled at once; a failure alerts and never throws.

const USER = '0b6f3f0e-5d1c-4c47-9a49-6a3f6f8d2e11'
const stripeRow = (id: string, patch: Partial<MirrorRow> = {}): MirrorRow => ({
  provider: 'stripe',
  stripeSubscriptionId: id,
  waffoOrderId: null,
  productId: 'starter_monthly',
  status: 'active',
  currentPeriodEnd: new Date('2026-12-06T00:00:00Z'),
  cancelAtPeriodEnd: false,
  ...patch,
})
const waffoRow = (orderId: string, patch: Partial<MirrorRow> = {}): MirrorRow =>
  stripeRow('unused', { provider: 'waffo', stripeSubscriptionId: null, waffoOrderId: orderId, ...patch })

const cancelledSub = (id: string) => ({
  id,
  status: 'canceled',
  cancel_at: null,
  cancel_at_period_end: false,
  items: { data: [{ current_period_end: 1_796_000_000 }] },
})

function deps() {
  const rpc = vi.fn().mockResolvedValue({ data: true, error: null })
  const stripe = {
    subscriptions: {
      cancel: vi.fn(async (id: string) => cancelledSub(id)),
      retrieve: vi.fn(async (id: string) => ({ id, status: 'active' })),
    },
  }
  const waffo = { cancelSubscription: vi.fn(async () => ({ status: 'canceling', currentPeriodEnd: '2026-12-06' })) }
  return {
    rpc,
    stripe,
    waffo,
    deps: {
      admin: { rpc } as never,
      stripe: () => stripe as never,
      waffo: () => waffo as never,
      now: () => new Date('2026-11-07T10:00:00Z'),
    },
  }
}

describe('cancelOtherSubscriptions', () => {
  beforeEach(() => {
    mocks.mirror.mockReset()
    mocks.alert.mockReset()
  })

  it('cancels the old Stripe subscription now, without proration or a final invoice, and syncs the mirror', async () => {
    const t = deps()
    mocks.mirror.mockResolvedValue([stripeRow('sub_old'), stripeRow('sub_new', { productId: 'pro_monthly' })])
    expect(await cancelOtherSubscriptions(t.deps, USER, { stripeSubscriptionId: 'sub_new' })).toEqual({ cancelled: 1, failed: 0 })
    expect(t.stripe.subscriptions.cancel).toHaveBeenCalledOnce()
    expect(t.stripe.subscriptions.cancel).toHaveBeenCalledWith('sub_old', { prorate: false, invoice_now: false })
    expect(t.rpc).toHaveBeenCalledWith('sync_subscription', expect.objectContaining({ p_subscription_id: 'sub_old', p_status: 'canceled' }))
    expect(mocks.alert).not.toHaveBeenCalled()
  })

  it('cancels an old Waffo order through cancel-order and mirrors it as cancelling', async () => {
    const t = deps()
    mocks.mirror.mockResolvedValue([waffoRow('ORD_old'), waffoRow('ORD_new', { productId: 'max_monthly' })])
    expect(await cancelOtherSubscriptions(t.deps, USER, { waffoOrderId: 'ORD_new' })).toEqual({ cancelled: 1, failed: 0 })
    expect(t.waffo.cancelSubscription).toHaveBeenCalledWith('ORD_old')
    expect(t.rpc).toHaveBeenCalledWith(
      'sync_waffo_subscription',
      expect.objectContaining({ p_order_id: 'ORD_old', p_product_id: 'starter_monthly', p_status: 'active', p_cancel_at_period_end: true }),
    )
  })

  it('crosses channels: a Stripe upgrade cancels a Waffo subscription too', async () => {
    const t = deps()
    mocks.mirror.mockResolvedValue([waffoRow('ORD_old'), stripeRow('sub_new', { productId: 'pro_yearly' })])
    await cancelOtherSubscriptions(t.deps, USER, { stripeSubscriptionId: 'sub_new' })
    expect(t.waffo.cancelSubscription).toHaveBeenCalledWith('ORD_old')
    expect(t.stripe.subscriptions.cancel).not.toHaveBeenCalled()
  })

  it('leaves alone what no longer renews: ended, already cancelling, never started', async () => {
    const t = deps()
    mocks.mirror.mockResolvedValue([
      stripeRow('sub_a', { status: 'canceled' }),
      stripeRow('sub_b', { cancelAtPeriodEnd: true }),
      stripeRow('sub_c', { status: 'incomplete_expired' }),
      waffoRow('ORD_d', { cancelAtPeriodEnd: true }),
    ])
    expect(await cancelOtherSubscriptions(t.deps, USER, {})).toEqual({ cancelled: 0, failed: 0 })
    expect(t.stripe.subscriptions.cancel).not.toHaveBeenCalled()
    expect(t.waffo.cancelSubscription).not.toHaveBeenCalled()
  })

  it('a one-time upgrade (Alipay) keeps nothing and cancels every renewing subscription, past due included', async () => {
    const t = deps()
    mocks.mirror.mockResolvedValue([stripeRow('sub_old', { status: 'past_due' })])
    expect(await cancelOtherSubscriptions(t.deps, USER, { stripeSubscriptionId: null })).toEqual({ cancelled: 1, failed: 0 })
  })

})

describe('cancelOtherSubscriptions failures', () => {
  beforeEach(() => {
    mocks.mirror.mockReset()
    mocks.alert.mockReset()
  })

  it('a failed cancel alerts, keeps going with the rest, and never throws', async () => {
    const t = deps()
    t.stripe.subscriptions.cancel.mockRejectedValueOnce(Object.assign(new Error('boom'), { statusCode: 500 }))
    t.waffo.cancelSubscription.mockRejectedValueOnce(new Error('waffo down'))
    mocks.mirror.mockResolvedValue([stripeRow('sub_bad'), waffoRow('ORD_bad'), stripeRow('sub_ok')])
    expect(await cancelOtherSubscriptions(t.deps, USER, { stripeSubscriptionId: 'sub_new' })).toEqual({ cancelled: 1, failed: 2 })
    expect(mocks.alert).toHaveBeenCalledTimes(2)
    expect(mocks.alert).toHaveBeenCalledWith(
      'subscription_cancel_failed',
      expect.any(String),
      expect.objectContaining({ fields: expect.objectContaining({ user_id: USER, provider: 'stripe', subscription: 'sub_bad' }) }),
    )
    expect(t.stripe.subscriptions.cancel).toHaveBeenCalledWith('sub_ok', { prorate: false, invoice_now: false })
  })

  it('a cancel Stripe refuses because the subscription already ended counts as done', async () => {
    const t = deps()
    t.stripe.subscriptions.cancel.mockRejectedValueOnce(new Error('already canceled'))
    t.stripe.subscriptions.retrieve.mockResolvedValueOnce({ id: 'sub_old', status: 'canceled' })
    mocks.mirror.mockResolvedValue([stripeRow('sub_old')])
    expect(await cancelOtherSubscriptions(t.deps, USER, {})).toEqual({ cancelled: 1, failed: 0 })
    expect(mocks.alert).not.toHaveBeenCalled()
  })

  it('a mirror read that fails alerts instead of throwing', async () => {
    const t = deps()
    mocks.mirror.mockRejectedValue(new Error('db down'))
    expect(await cancelOtherSubscriptions(t.deps, USER, {})).toEqual({ cancelled: 0, failed: 1 })
    expect(mocks.alert).toHaveBeenCalledWith('subscription_cancel_failed', expect.any(String), expect.anything())
  })
})
