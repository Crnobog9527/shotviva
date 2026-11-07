import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ alert: vi.fn(), notify: vi.fn() }))
vi.mock('../../analytics/capture-error', () => ({ captureAlert: mocks.alert }))
vi.mock('../../alerts', () => ({ notifyOwner: mocks.notify }))

const { refuseEndedOrder } = await import('./ended-order')

// A Waffo order an upgrade ended (T66): Waffo keeps it `canceling` until its period end, so a
// charge or a resume reported after the upgrade time must grant nothing.

const USER = '0b6f3f0e-5d1c-4c47-9a49-6a3f6f8d2e11'
const UPGRADED_AT = '2026-11-07T10:00:00.000Z'

function deps(row: Record<string, unknown> | null) {
  const eq = vi.fn(() => ({ maybeSingle: async () => ({ data: row, error: null }) }))
  const admin = { from: vi.fn(() => ({ select: () => ({ eq }) })) }
  const waffo = { cancelSubscription: vi.fn(async () => ({ orderId: 'ORD_old', status: 'canceling' })) }
  return { eq, waffo, deps: { admin: admin as never, waffo: () => waffo } }
}

const ended = { user_id: USER, product_id: 'starter_monthly', status: 'canceled', current_period_end: UPGRADED_AT }

describe('refuseEndedOrder', () => {
  beforeEach(() => {
    mocks.alert.mockReset()
    mocks.notify.mockReset()
  })

  it('refuses a renewal charge after the upgrade: cancels again and alerts the Owner', async () => {
    const t = deps(ended)
    expect(await refuseEndedOrder(t.deps, { orderId: 'ORD_old', at: '2026-12-07T08:00:00.000Z', what: 'charge' })).toBe(true)
    expect(t.eq).toHaveBeenCalledWith('waffo_order_id', 'ORD_old')
    expect(t.waffo.cancelSubscription).toHaveBeenCalledWith('ORD_old')
    expect(mocks.alert).toHaveBeenCalledWith('subscription_cancel_failed', expect.any(String), expect.anything())
    expect(mocks.notify).toHaveBeenCalledWith({ kind: 'subscription_cancel_failed', userId: USER, channel: 'waffo', productId: 'starter_monthly', subscriptionRef: 'ORD_old' })
  })

  it('refuses a resume too, and still refuses when the re-cancel fails', async () => {
    const t = deps(ended)
    t.waffo.cancelSubscription.mockRejectedValueOnce(new Error('400 cannot be canceled'))
    expect(await refuseEndedOrder(t.deps, { orderId: 'ORD_old', at: '2026-11-08T00:00:00.000Z', what: 'reactivation' })).toBe(true)
    expect(mocks.notify).toHaveBeenCalledOnce()
  })

  it('lets through what happened before the order ended, a live order, and an unknown order', async () => {
    expect(await refuseEndedOrder(deps(ended).deps, { orderId: 'ORD_old', at: '2026-11-07T09:59:59.000Z', what: 'charge' })).toBe(false)
    expect(await refuseEndedOrder(deps({ ...ended, status: 'active' }).deps, { orderId: 'ORD_old', at: '2026-12-07T08:00:00.000Z', what: 'charge' })).toBe(false)
    expect(await refuseEndedOrder(deps(null).deps, { orderId: 'ORD_new', at: '2026-12-07T08:00:00.000Z', what: 'charge' })).toBe(false)
    expect(mocks.alert).not.toHaveBeenCalled()
  })
})
