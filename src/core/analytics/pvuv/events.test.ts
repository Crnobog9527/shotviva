import { describe, expect, it, vi } from 'vitest'

import { createServerTracker, type ServerTrackerDeps } from '../server-track'
import { logger } from '../../logger'
import { pvuvServerEvent, sendPvuvEvent } from './events'
import { pvuvProps } from './props'

type Fetch = NonNullable<ServerTrackerDeps['fetch']>
const ctx = { distinctId: 'user-1', locale: 'en' as const }

function setup(pvuv: ServerTrackerDeps['pvuv'], key = '', visitorId?: string) {
  const tasks: (() => Promise<void>)[] = []
  const fetch = vi.fn<Fetch>(async () => ({ ok: true, status: 200 }))
  const track = createServerTracker({
    key, host: 'https://us.i.posthog.com', fetch, pvuv,
    visitorId: async () => visitorId,
    schedule: (task) => void tasks.push(task),
    now: () => new Date('2026-11-22T00:00:00Z'),
  })
  return { track, fetch, run: () => Promise.all(tasks.map((t) => t())), tasks }
}

describe('pvuvProps', () => {
  it('flattens arrays and records, drops null', () => {
    expect(pvuvProps({ a: 1, b: true, c: null, d: ['x', 'y'], e: { on: true, off: false }, f: 'z' }, { locale: 'zh' })).toEqual({
      a: 1, b: true, d: 'x,y', e: 'on:true,off:false', f: 'z', locale: 'zh',
    })
  })
})

describe('pvuvServerEvent', () => {
  it('turns purchase into revenue in USD and keeps the amount out of props', () => {
    const event = pvuvServerEvent(
      'purchase',
      { product_id: 'pro-month', tier: 'pro', amount_usd: 29, amount_discount_usd: 3, credits: 1990, channel: 'stripe' },
      { userId: 'u1', locale: 'en' }, 5,
    )
    expect(event).toMatchObject({ name: 'purchase', user_id: 'u1', revenue: 29, currency: 'USD', ts: 5 })
    expect(event.props).toEqual({ product_id: 'pro-month', tier: 'pro', credits: 1990, channel: 'stripe', locale: 'en' })
  })
  it('carries the visitor cookie only when there is one', () => {
    expect(pvuvServerEvent('signup', { method: 'email' }, { userId: 'u1', locale: 'en', visitorId: 'v1' }, 1).visitor_id).toBe('v1')
    expect('visitor_id' in pvuvServerEvent('signup', { method: 'email' }, { userId: 'u1', locale: 'en' }, 1)).toBe(false)
  })
})

describe('server tracker → PVUV', () => {
  it('posts the event with the ingest token after the response, PostHog off', async () => {
    const { track, fetch, run, tasks } = setup(() => ({ site: 'S1', token: 'tok' }), '', 'vis-1')
    track('signup', { method: 'google' }, ctx)
    expect(fetch).not.toHaveBeenCalled()
    expect(tasks).toHaveLength(1)
    await run()
    expect(fetch).toHaveBeenCalledTimes(1)
    const [url, init] = fetch.mock.calls[0] ?? []
    expect(url).toBe('https://api.pvuv.ai/v1/sites/S1/events')
    expect((init?.headers as Record<string, string>).authorization).toBe('Bearer tok')
    expect(JSON.parse(String(init?.body)).events[0]).toMatchObject({ name: 'signup', user_id: 'user-1', visitor_id: 'vis-1', props: { method: 'google', locale: 'en' } })
  })

  it('is a no-op with neither PostHog nor PVUV configured, and when the PVUV read throws', () => {
    const none = setup(() => null)
    none.track('signup', { method: 'email' }, ctx)
    const broken = setup(() => { throw new Error('bad env') })
    expect(() => broken.track('signup', { method: 'email' }, ctx)).not.toThrow()
    expect(none.tasks).toHaveLength(0)
    expect(broken.tasks).toHaveLength(0)
  })

  it('sends to both when both are on, and survives a failing PVUV fetch', async () => {
    const { track, fetch, run } = setup(() => ({ site: 'S1', token: 'tok' }), 'phc_x')
    fetch.mockImplementation(async (url) => {
      if (String(url).includes('pvuv')) throw new Error('down')
      return { ok: true, status: 200 }
    })
    track('signup', { method: 'email' }, ctx)
    await expect(run()).resolves.toBeDefined()
    expect(fetch).toHaveBeenCalledTimes(2)
  })
})

describe('dedupe id', () => {
  it('derives a PVUV id from the event name and the payment or checkout id, only when there is one', () => {
    const base = { userId: 'u1', locale: 'en' }
    expect(pvuvServerEvent('purchase', {}, { ...base, eventId: 'cs_live_a1B2c3' }, 1).id).toBe('purchase-cs_live_a1B2c3')
    expect(pvuvServerEvent('checkout_start', {}, { ...base, eventId: 'attempt token:1' }, 1).id).toBe('checkout_start-attempt_token_1')
    expect('id' in pvuvServerEvent('signup', {}, base, 1)).toBe(false)
    expect(pvuvServerEvent('purchase', {}, { ...base, eventId: 'x'.repeat(100) }, 1).id).toHaveLength(64)
  })
})

describe('sendPvuvEvent logging', () => {
  const event = pvuvServerEvent('signup', { method: 'email' }, { userId: 'u1', locale: 'en' }, 1)
  const config = { site: 'S1', token: 'tok' }

  it('warns with status and reasons when PVUV refuses, without token or user id', async () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => undefined)
    await sendPvuvEvent(config, event, async () => ({ ok: false, status: 401 }))
    await sendPvuvEvent(config, event, async () => ({ ok: true, status: 200, json: async () => ({ accepted: 0, rejected: [{ index: 0, error: 'bad_name' }] }) }))
    expect(warn).toHaveBeenCalledWith('pvuv event rejected', { event: 'signup', status: 401, reasons: [] })
    expect(warn).toHaveBeenCalledWith('pvuv event rejected', { event: 'signup', status: 200, reasons: ['bad_name'] })
    expect(JSON.stringify(warn.mock.calls)).not.toMatch(/tok|u1/)
    warn.mockRestore()
  })

  it('stays quiet when accepted, and logs a thrown fetch without throwing', async () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => undefined)
    await sendPvuvEvent(config, event, async () => ({ ok: true, status: 200, json: async () => ({ accepted: 1, rejected: [] }) }))
    expect(warn).not.toHaveBeenCalled()
    await expect(sendPvuvEvent(config, event, async () => { throw new Error('down') })).resolves.toBeUndefined()
    expect(warn).toHaveBeenCalledWith('pvuv event not sent', expect.objectContaining({ event: 'signup' }))
    warn.mockRestore()
  })
})
