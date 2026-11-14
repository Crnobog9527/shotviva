import { afterEach, describe, expect, it, vi } from 'vitest'

import { readEdge } from './edge'
import { edgeWindow, parseEdgeSnapshot, queryEdge } from './edge-query'

const { env, cache } = vi.hoisted(() => ({
  env: {} as Record<string, string>,
  cache: vi.fn(),
}))
vi.mock('../../env', () => ({ serverEnv: () => env }))
vi.mock('next/cache', () => ({ cacheLife: cache }))

const now = Date.parse('2026-01-08T17:28:00Z')
const window = edgeWindow('7d', now)
const scope = { ownerId: 'fixture-team', projectId: 'fixture-project' }
const effective = { startTime: window.start, endTime: window.end }
const bucket = '2026-01-05T16:00:00.000Z'
const row = (n: number, verified = '', name = '') => ({ vercel_request_count_sum: n, bot_verified: verified, bot_name: name })
const all = {
  query: effective,
  data: [{ timestamp: bucket, vercel_request_count_sum: 15 }],
  summary: [row(2, 'pass', 'crawler'), row(1, 'fail', 'crawler'), row(1, '', 'nonverified'), row(11)],
}
const matches = {
  query: { startTime: bucket, endTime: '2026-01-05T17:00:00.000Z' },
  summary: [row(2, 'pass', 'crawler'), row(1, 'fail', 'crawler'), row(3)],
}
const sample = {
  start: window.start,
  end: window.end,
  firstNonzeroBucket: bucket,
  lastNonzeroBucket: bucket,
  host: 'shotviva.com',
  all: { requests: 15, verified: 2, suspected: 5, unclassified: 8 },
  verifiedBots: { crawler: 2 },
}

afterEach(() => {
  for (const key of Object.keys(env)) delete env[key]
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('CDN requests', () => {
  it('reads two sequential aggregates and never double-counts overlapping evidence', async () => {
    const run = vi.fn().mockResolvedValueOnce(all).mockResolvedValueOnce(matches)
    expect(await queryEdge(run, scope, window)).toEqual(sample)
    expect(run).toHaveBeenCalledTimes(2)
    const queries = run.mock.calls.map(([body]) => body)
    expect(queries[0]).toMatchObject({
      groupBy: ['bot_verified', 'bot_name'],
      filter: expect.stringContaining("request_hostname eq 'shotviva.com'"),
    })
    expect(queries[1].filter).toContain('HeadlessChrome')
    expect(queries[1].groupBy).not.toContain('client_user_agent')
  })

  it('does not interpret missing records, truncation or a changed effective period as complete counts', async () => {
    const noHours = { ...all, data: [] }
    await expect(queryEdge(async () => noHours, scope, window)).rejects.toMatchObject({ reason: 'noCoverage' })
    const widened = { ...all, query: { ...effective, endTime: '2026-01-09T00:00:00Z' } }
    await expect(queryEdge(async () => widened, scope, window)).rejects.toMatchObject({ reason: 'noCoverage' })
    await expect(queryEdge(async () => ({ ...all, summary: Array(100).fill(row(1)) }), scope, window)).rejects.toThrow()
    expect(parseEdgeSnapshot(JSON.stringify({ ...sample, all: { ...sample.all, requests: 0 } }))).toBeNull()
    expect(parseEdgeSnapshot('invalid')).toBeNull()
  })

  it('uses closed intervals anchored to Beijing midnight, 7 days or 30 days', () => {
    expect(edgeWindow('today', now)).toEqual({
      start: '2026-01-08T16:00:00.000Z',
      end: '2026-01-08T17:25:00.000Z',
      bucketMinutes: 5,
    })
    expect(window).toEqual({ start: '2026-01-02T16:00:00.000Z', end: '2026-01-08T17:00:00.000Z', bucketMinutes: 60 })
    expect(edgeWindow('30d', now).start).toBe('2025-12-10T16:00:00.000Z')
  })

})

describe('edge read access', () => {
  it('serves a dated private fallback without any live requests; returns unknown when neither is available', async () => {
    const fetcher = vi.fn()
    vi.stubGlobal('fetch', fetcher)
    expect(await readEdge('today')).toEqual({ source: 'unknown', reason: 'unconfigured', data: null })
    env.VERCEL_OBSERVABILITY_SNAPSHOT = JSON.stringify(sample)
    expect(await readEdge('30d')).toEqual({ source: 'snapshot', reason: 'unconfigured', data: sample })
    expect(fetcher).not.toHaveBeenCalled()
  })

  it.each([403, 429])('handles dashboard API HTTP %d without surfacing its body', async (status) => {
    Object.assign(env, {
      VERCEL_OBSERVABILITY_TOKEN: 'fixture',
      VERCEL_OBSERVABILITY_TEAM_ID: 'team',
      VERCEL_OBSERVABILITY_PROJECT_ID: 'project',
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('private upstream message', { status })))
    expect(await readEdge('7d')).toEqual({ source: 'unknown', reason: status === 403 ? 'denied' : 'unavailable', data: null })
  })

  it('uses the selected range and the ten-minute cache policy through the normal read operation', async () => {
    vi.useFakeTimers().setSystemTime(now)
    Object.assign(env, {
      VERCEL_OBSERVABILITY_TOKEN: 'fixture',
      VERCEL_OBSERVABILITY_TEAM_ID: 'team',
      VERCEL_OBSERVABILITY_PROJECT_ID: 'project',
    })
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json(all)).mockResolvedValueOnce(Response.json(matches))
    vi.stubGlobal('fetch', fetcher)
    const result = await readEdge('7d')
    expect(result).toMatchObject({ source: 'live', data: sample })
    expect(cache).toHaveBeenCalledWith({ stale: 300, revalidate: 600, expire: 900 })
    expect(fetcher).toHaveBeenCalledTimes(2)
  })
})
