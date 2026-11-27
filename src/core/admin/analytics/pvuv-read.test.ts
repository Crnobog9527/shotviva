import { describe, expect, it, vi } from 'vitest'

import { pvuvBreakdown, pvuvFunnel, pvuvFunnels, pvuvOverview, PvuvReadError, shapeBreakdown, shapeFunnel, shapeFunnels, shapeOverview } from './pvuv-read'

const access = { site: 'W7NnoaRK', token: 'pvuv_secret' }

describe('PVUV read (§5.1g)', () => {
  it('reads rows leniently: value / name / key, visitors / uniques, events / count', () => {
    expect(shapeBreakdown({ dim: 'goal', rows: [{ value: 'a', visitors: 3, events: 5 }, { name: 'b', uniques: 2, count: 4 }, { key: 7 }, { visitors: 1 }], report: { state: 'ready' } })).toEqual({
      ready: true,
      rows: [{ value: 'a', visitors: 3, events: 5 }, { value: 'b', visitors: 2, events: 4 }, { value: '7', visitors: null, events: null }],
    })
    expect(shapeBreakdown({ rows: [], report: { state: 'refreshing' } }).ready).toBe(false)
    expect(shapeBreakdown({ rows: [] }).ready).toBe(true)
    expect(() => shapeBreakdown({ error: 'nope' })).toThrow(PvuvReadError)
  })

  it('asks the breakdown endpoint with the token in the header only', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ rows: [] }), { status: 200 }))
    await pvuvBreakdown(access, { dim: 'prop:collection_id', period: '7d', limit: 10 }, fetcher as never)
    const [url, init] = fetcher.mock.calls[0] as unknown as [URL, RequestInit]
    expect(url.href).toBe('https://api.pvuv.ai/v1/sites/W7NnoaRK/breakdown?dim=prop%3Acollection_id&period=7d&limit=10')
    expect(init.headers).toEqual({ authorization: 'Bearer pvuv_secret' })
  })

  it('throws on an HTTP error or a network failure, never with the token in the message', async () => {
    const denied = vi.fn(async () => new Response('{"error":"forbidden"}', { status: 403 }))
    await expect(pvuvBreakdown(access, { dim: 'goal', period: 'today', limit: 1 }, denied as never)).rejects.toMatchObject({ status: 403 })
    const down = vi.fn(async () => { throw new TypeError('fetch failed') })
    const error = await pvuvBreakdown(access, { dim: 'goal', period: 'today', limit: 1 }, down as never).catch((e: Error) => e)
    expect(error).toBeInstanceOf(PvuvReadError)
    expect(String(error)).not.toContain('pvuv_secret')
  })

})

describe('PVUV read: overview and funnels (PostHog off)', () => {
  it('reads the overview and the previous period, with missing extras as null, never 0', () => {
    const body = {
      period: { start: '2026-11-16', end: '2026-11-22' },
      pv: 900, uv: 300, uv_all: 420, sessions: 360, bounce_rate: 0.42, avg_duration_ms: 65_000, bot_count: 80,
      previous: { pv: 600, uv: 200, sessions: null, bounce_rate: null, visit_duration_ms: 30_000, start_ts: 1, end_ts: 2 },
    }
    expect(shapeOverview(body)).toEqual({
      current: { pv: 900, uv: 300, sessions: 360, bounceRate: 0.42, avgDurationMs: 65_000 },
      previous: { pv: 600, uv: 200, sessions: null, bounceRate: null, avgDurationMs: 30_000 },
    })
    expect(shapeOverview({ pv: 1, uv: 1, bounce_rate: 3 })).toEqual({ current: { pv: 1, uv: 1, sessions: null, bounceRate: null, avgDurationMs: null }, previous: null })
    expect(() => shapeOverview({ pv: 1 })).toThrow(PvuvReadError)
    expect(() => shapeOverview({ error: 'unauthorized' })).toThrow(PvuvReadError)
  })

  it('reads the saved funnels, falling back to the id for a funnel without a name', () => {
    expect(shapeFunnels({ funnels: [{ funnel_id: 'f1', name: 'Signup', steps: [], options: {} }, { funnel_id: 7, name: ' ' }] })).toEqual([
      { id: 'f1', name: 'Signup' },
      { id: '7', name: '7' },
    ])
    expect(shapeFunnels({ funnels: [] })).toEqual([])
    expect(() => shapeFunnels({ error: 'nope' })).toThrow(PvuvReadError)
  })

  it('reads one funnel: steps, side steps, rates clamped to 0..1, low samples marked', () => {
    const step = (label: string, visitors: number, rate: number | null, low = false) => ({
      label, type: 'pageview', value: '/x', visitors, dropped: 0, conv_prev: rate === null ? null : { rate, low: 0, high: 1 }, conv_first: null, low_sample: low, median_gap_ms: null,
    })
    const shaped = shapeFunnel({ steps: [step('Visit', 100, null), step('Upload', 40, 0.4), step('Pay', 2, 1.2, true)], side_steps: [step('Pricing', 30, 0.3)], entered: 100, clean_only: true })
    expect(shaped.steps).toEqual([
      { label: 'Visit', visitors: 100, convPrev: null, convFirst: null, lowSample: false },
      { label: 'Upload', visitors: 40, convPrev: 0.4, convFirst: null, lowSample: false },
      { label: 'Pay', visitors: 2, convPrev: 1, convFirst: null, lowSample: true },
    ])
    expect(shaped.sideSteps).toHaveLength(1)
    expect(shaped).toMatchObject({ entered: 100, cleanOnly: true })
    expect(shapeFunnel({ steps: [{ value: '/start', visitors: 3 }] })).toEqual({
      steps: [{ label: '/start', visitors: 3, convPrev: null, convFirst: null, lowSample: false }], sideSteps: [], entered: null, cleanOnly: false,
    })
    expect(() => shapeFunnel({ steps: [{ label: 'a' }] })).toThrow(PvuvReadError)
  })

})

describe('PVUV read: overview and funnels requests', () => {
  it('asks overview, funnels and funnel with the token in the header only', async () => {
    const answers = [{ pv: 1, uv: 1 }, { funnels: [] }, { steps: [] }]
    const fetcher = vi.fn(async () => new Response(JSON.stringify(answers.shift()), { status: 200 }))
    await pvuvOverview(access, '30d', fetcher as never)
    await pvuvFunnels(access, fetcher as never)
    await pvuvFunnel(access, { id: 'f 1', period: 'today' }, fetcher as never)
    const calls = fetcher.mock.calls as unknown as [URL, RequestInit][]
    expect(calls.map(([url]) => url.href)).toEqual([
      'https://api.pvuv.ai/v1/sites/W7NnoaRK/overview?period=30d&compare=true',
      'https://api.pvuv.ai/v1/sites/W7NnoaRK/funnels',
      'https://api.pvuv.ai/v1/sites/W7NnoaRK/funnel?funnel_id=f+1&period=today',
    ])
    for (const [url, init] of calls) {
      expect(init.headers).toEqual({ authorization: 'Bearer pvuv_secret' })
      expect(url.href).not.toContain('pvuv_secret')
    }
  })

  it('throws on a 401 / 404 from the newer endpoints too', async () => {
    const missing = vi.fn(async () => new Response('{"error":"not found"}', { status: 404 }))
    await expect(pvuvFunnel(access, { id: 'gone', period: '7d' }, missing as never)).rejects.toMatchObject({ status: 404 })
    const denied = vi.fn(async () => new Response('{"error":"unauthorized"}', { status: 401 }))
    await expect(pvuvOverview(access, '7d', denied as never)).rejects.toMatchObject({ status: 401 })
    const garbage = vi.fn(async () => new Response('<html>', { status: 200 }))
    await expect(pvuvFunnels(access, garbage as never)).rejects.toBeInstanceOf(PvuvReadError)
  })
})
