import { describe, expect, it, vi } from 'vitest'

import { pvuvBreakdown, PvuvReadError, shapeBreakdown } from './pvuv-read'

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
