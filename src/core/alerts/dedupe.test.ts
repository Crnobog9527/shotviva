import { describe, expect, it, vi } from 'vitest'

import { createMemoryStore } from '../../../tests/fakes/memory-store'
import { dedupeKey } from './alert-kinds'
import { createDedupe, markerKey } from './dedupe'

describe('createDedupe', () => {
  it('lets one caller through per key, across instances sharing the bucket', async () => {
    const { store, objects } = createMemoryStore()
    const first = createDedupe(() => store)
    const second = createDedupe(() => store)
    expect(await first.claim('payment_failed:stripe:evt_1')).toBe(true)
    expect(await first.claim('payment_failed:stripe:evt_1')).toBe(false)
    expect(await second.claim('payment_failed:stripe:evt_1')).toBe(false)
    expect(await second.claim('payment_failed:stripe:evt_2')).toBe(true)
    expect([...objects.keys()]).toEqual(['ops/alerts/payment_failed:stripe:evt_1', 'ops/alerts/payment_failed:stripe:evt_2'])
  })

  it('still sends when R2 is down or not configured, once per instance', async () => {
    const putIfAbsent = vi.fn(async () => {
      throw new Error('R2 down')
    })
    const down = createDedupe(() => ({ putIfAbsent, delete: vi.fn() }))
    expect(await down.claim('k')).toBe(true)
    expect(await down.claim('k')).toBe(false)
    const none = createDedupe(() => null)
    expect(await none.claim('k')).toBe(true)
    expect(none.seen('k')).toBe(true)
  })

  it('releases a key after a failed send so a redelivery can try again', async () => {
    const { store, objects } = createMemoryStore()
    const dedupe = createDedupe(() => store)
    await dedupe.claim('k')
    await dedupe.release('k')
    expect(objects.size).toBe(0)
    expect(await dedupe.claim('k')).toBe(true)
  })

  it('keeps marker keys to safe characters', () => {
    expect(markerKey('ticket:a/b c:new')).toBe('ops/alerts/ticket:a_b_c:new')
  })
})

describe('dedupeKey', () => {
  it('is per fact: a refund by charge and refunded total, a ticket by message', () => {
    const refund = { kind: 'refund', channel: 'stripe', refundId: 'ch_1', userId: null, productId: null, amount: null, credits: null } as const
    expect(dedupeKey({ ...refund, refunded: { cents: 100, currency: 'usd' } })).toBe('refund:stripe:ch_1:100')
    expect(dedupeKey({ ...refund, refunded: { cents: 300, currency: 'usd' } })).toBe('refund:stripe:ch_1:300')
    expect(dedupeKey({ kind: 'ticket', ticketId: 't', messageId: null, userId: 'u', ticketType: null })).toBe('ticket:t:new')
    expect(dedupeKey({ kind: 'generation_spike', failed: 5, total: 9, windowMinutes: 60, hour: '2026-11-08T10' })).toBe('generation_spike:2026-11-08T10')
  })
})
