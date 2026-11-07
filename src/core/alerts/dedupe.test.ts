import { describe, expect, it, vi } from 'vitest'

import { createMemoryMarkers } from '../../../tests/fakes/memory-markers'
import { alertPolicy } from './alert-kinds'
import { createDedupe, markerKey, TICKET_BUDGET_PER_HOUR } from './dedupe'

const MINUTE = 60_000

function clock(start = Date.parse('2026-11-08T10:00:00Z')) {
  const time = { now: start }
  return { time, now: () => time.now }
}

describe('createDedupe', () => {
  it('lets one caller through per key, across instances sharing the bucket', async () => {
    const { store, marks } = createMemoryMarkers()
    const first = createDedupe(() => store)
    const second = createDedupe(() => store)
    expect(await first.claim('payment_failed:stripe:evt_1')).toBe(true)
    expect(await first.claim('payment_failed:stripe:evt_1')).toBe(false)
    expect(await second.claim('payment_failed:stripe:evt_1')).toBe(false)
    expect(await second.claim('payment_failed:stripe:evt_2')).toBe(true)
    expect([...marks.keys()]).toEqual(['ops/alerts/payment_failed:stripe:evt_1', 'ops/alerts/payment_failed:stripe:evt_2'])
  })

  it('slides a cooldown from the last claim: 10:29 and 10:30 are not both let through', async () => {
    const { time, now } = clock()
    const { store } = createMemoryMarkers(now)
    const a = createDedupe(() => store, now)
    const b = createDedupe(() => store, now)
    time.now += 29 * MINUTE
    expect(await a.claim('site_errors', 30 * MINUTE)).toBe(true)
    time.now += MINUTE
    expect(await b.claim('site_errors', 30 * MINUTE)).toBe(false)
    time.now += 29 * MINUTE + 59_000
    expect(await b.claim('site_errors', 30 * MINUTE)).toBe(false)
    time.now += 2000
    expect(await b.claim('site_errors', 30 * MINUTE)).toBe(true)
    expect(b.held('site_errors', 30 * MINUTE)).toBe(true)
    expect(a.held('site_errors', 30 * MINUTE)).toBe(false)
  })

  it('still sends when R2 is down or not configured, once per instance', async () => {
    const down = createDedupe(() => ({ claim: vi.fn(async () => Promise.reject(new Error('R2 down'))), release: vi.fn() }))
    expect(await down.claim('k')).toBe(true)
    expect(await down.claim('k')).toBe(false)
    const none = createDedupe(() => null)
    expect(await none.claim('k')).toBe(true)
    expect(none.held('k')).toBe(true)
  })

  it('releases a key so a later event can try again', async () => {
    const { store, marks } = createMemoryMarkers()
    const dedupe = createDedupe(() => store)
    await dedupe.claim('k')
    await dedupe.release('k')
    expect(marks.size).toBe(0)
    expect(await dedupe.claim('k')).toBe(true)
  })

  it('caps ticket alerts per hour across instances, and refills the next hour', async () => {
    const { time, now } = clock()
    const { store } = createMemoryMarkers(now)
    const a = createDedupe(() => store, now)
    const b = createDedupe(() => store, now)
    const taken = []
    for (let i = 0; i < TICKET_BUDGET_PER_HOUR + 3; i += 1) taken.push(await (i % 2 ? a : b).takeTicketSlot())
    expect(taken.filter(Boolean)).toHaveLength(TICKET_BUDGET_PER_HOUR)
    time.now += 60 * MINUTE
    expect(await a.takeTicketSlot()).toBe(true)
  })

  it('keeps marker keys to safe characters', () => {
    expect(markerKey('ticket:a/b c')).toBe('ops/alerts/ticket:a_b_c')
  })
})

describe('alertPolicy', () => {
  it('keys per fact; replies per ticket with a 30-minute cooldown; money kinds flagged', () => {
    const refund = { kind: 'refund', channel: 'stripe', refundId: 'ch_1', userId: null, productId: null, amount: null, credits: null } as const
    expect(alertPolicy({ ...refund, refunded: { cents: 100, currency: 'usd' } })).toEqual({ key: 'refund:stripe:ch_1:100', money: true })
    expect(alertPolicy({ ...refund, refunded: { cents: 300, currency: 'usd' } }).key).toBe('refund:stripe:ch_1:300')
    const ticket = { kind: 'ticket', ticketId: 't', userId: 'u', ticketType: null, pending: null } as const
    expect(alertPolicy({ ...ticket, reply: false })).toEqual({ key: 'ticket:t', budget: 'tickets', money: false })
    expect(alertPolicy({ ...ticket, reply: true })).toEqual({ key: 'ticket_reply:t', cooldownMs: 30 * MINUTE, budget: 'tickets', money: false })
    expect(alertPolicy({ kind: 'generation_spike', failed: 5, total: 9, windowMinutes: 60 })).toEqual({ key: 'generation_spike', cooldownMs: 60 * MINUTE, money: false })
  })
})
