import { expect, it, vi } from 'vitest'

import { notifyOwner } from '../../alerts'
import { alertPolicy } from '../../alerts/alert-kinds'
import { renderAlert } from '../../alerts/templates'
import { quoteMetadata } from '../checkout-price'
import { USER } from '../stripe/test-checkout'
import { testProduct } from '../stripe/test-products'
import { fulfilWaffoOrder } from './fulfil'

vi.mock('../../alerts', () => ({ notifyOwner: vi.fn() }))
const order = { orderId: 'ORD_test', periodNumber: 2, chargedAmount: '191.00', currency: 'USD',
  orderMetadata: { user_id: USER, product_id: 'starter_yearly', ...quoteMetadata({ cents: 19104, credits: 23880, memberTier: null }) } }
const ticketId = '28d1ac72-68a1-4e72-a56a-139ad682d33a'

it('acknowledges queued renewals, alerting only the creator and skipping entitlement side effects', async () => {
  const rpc = vi.fn().mockResolvedValueOnce({ data: { outcome: 'review', ticket_id: ticketId } })
    .mockResolvedValue({ data: { outcome: 'review' } })
  const deps = { db: { rpc }, products: [testProduct('starter_yearly')], applyCodes: vi.fn(), trackBuy: vi.fn(), cancelOthers: vi.fn() }
  for (const eventId of ['PAY_a', 'PAY_a']) {
    expect(await fulfilWaffoOrder(deps, { eventId, data: order }, 'subscription')).toBe('review')
  }
  expect(rpc).toHaveBeenCalledWith('settle_waffo_renewal_v2', expect.objectContaining({ p_period: 2, p_quoted: 19104, p_charged: 19100 }))
  expect(notifyOwner).toHaveBeenCalledTimes(1)
  const alert = vi.mocked(notifyOwner).mock.calls[0]![0]
  const rendered = renderAlert(alert, { who: null, origin: 'https://example.test', testSite: true })
  expect(rendered.sentence).toContain('ORD_test 第 2 期，税前报价 $191.04，含税实收 191.00 USD')
  expect(alertPolicy(alert).key).toBe('waffo_renewal:PAY_a')
  expect(rendered.link).toContain(`/admin/tickets/${ticketId}`)
  expect(deps.trackBuy).not.toHaveBeenCalled()
  expect(deps.applyCodes).not.toHaveBeenCalled()
  expect(deps.cancelOthers).not.toHaveBeenCalled()
})

it('tracks a matching renewal once and preserves replay post-settlement effects', async () => {
  const rpc = vi.fn().mockResolvedValueOnce({ data: { outcome: 'applied' } }).mockResolvedValue({ data: { outcome: 'replayed' } })
  const deps = { db: { rpc }, products: [testProduct('starter_yearly')], applyCodes: vi.fn(), trackBuy: vi.fn(), cancelOthers: vi.fn() }
  const event = { eventId: 'PAY_ok', data: { ...order, chargedAmount: '193.04', listPrice: { taxAmount: '2.00', subtotal: '191.04' } } }
  expect(await fulfilWaffoOrder(deps, event, 'subscription')).toBe('applied')
  expect(await fulfilWaffoOrder(deps, event, 'subscription')).toBe('replayed')
  expect(deps.trackBuy).toHaveBeenCalledExactlyOnceWith(USER, expect.objectContaining({ credits: 23880, amount_usd: 191.04 }), 'en')
  expect(deps.cancelOthers).toHaveBeenCalledTimes(2)
  await expect(fulfilWaffoOrder(deps, { ...event, data: { ...event.data, periodNumber: undefined } }, 'subscription')).rejects.toThrow('period')
})

it('routes a second payment ID in the same period to a distinct owner alert', async () => {
  const rpc = vi.fn().mockResolvedValue({ data: { outcome: 'review', ticket_id: ticketId, reason: 'duplicate_payment' } })
  const deps = { db: { rpc }, products: [testProduct('starter_yearly')], applyCodes: vi.fn() }
  await fulfilWaffoOrder(deps, { eventId: 'PAY_b', data: order }, 'subscription')
  const alert = vi.mocked(notifyOwner).mock.lastCall![0]
  expect(alertPolicy(alert).key).toBe('waffo_renewal:PAY_b')
  expect(renderAlert(alert, { who: null, origin: '', testSite: true }).sentence).toContain('同一期出现不同付款号')
})
