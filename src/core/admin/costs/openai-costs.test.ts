import { describe, expect, it, vi } from 'vitest'

import { fetchOpenAICosts, OpenAICostsError } from './openai-costs'

const KEY = 'sk-admin-test-secret-0123456789'
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
const day = (date: string) => Date.parse(`${date}T00:00:00Z`) / 1000
const bucket = (date: string, ...values: number[]) => ({
  object: 'bucket',
  start_time: day(date),
  end_time: day(date) + 86_400,
  results: values.map((value) => ({ object: 'organization.costs.result', amount: { value, currency: 'usd' }, line_item: null, project_id: null })),
})

const query = { apiKey: KEY, projectId: 'proj_abc', startDay: '2026-10-08', days: 30 }

describe('fetchOpenAICosts', () => {
  it('asks for daily buckets over the window, scoped to the project, with the Admin key', async () => {
    const fetchImpl = vi.fn(async () => json({ object: 'page', data: [bucket('2026-10-08', 1.25, 0.5)], has_more: false, next_page: null }))
    expect(await fetchOpenAICosts(query, fetchImpl)).toEqual({ '2026-10-08': 1.75 })
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    const params = new URL(url).searchParams
    expect(new URL(url).pathname).toBe('/v1/organization/costs')
    expect(params.get('start_time')).toBe(String(day('2026-10-08')))
    expect(params.get('end_time')).toBe(String(day('2026-11-07')))
    expect(params.get('bucket_width')).toBe('1d')
    expect(params.get('limit')).toBe('30')
    expect(params.getAll('project_ids[]')).toEqual(['proj_abc'])
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${KEY}`)
  })

  it('covers the whole organization without a project id, follows pages and skips other currencies', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(json({ data: [bucket('2026-10-08', 1)], has_more: true, next_page: 'p2' }))
      .mockResolvedValueOnce(
        json({ data: [bucket('2026-10-09', 2), { start_time: day('2026-10-10'), results: [{ amount: { value: 9, currency: 'eur' } }, { amount: null }] }], has_more: false }),
      )
    expect(await fetchOpenAICosts({ ...query, projectId: null }, fetchImpl)).toEqual({ '2026-10-08': 1, '2026-10-09': 2, '2026-10-10': 0 })
    const second = new URL(fetchImpl.mock.calls[1]?.[0] as string).searchParams
    expect(second.get('page')).toBe('p2')
    expect(second.has('project_ids[]')).toBe(false)
  })

  it('maps a refused key, an HTTP error, bad JSON and a network failure, never echoing the key', async () => {
    const cases: [typeof fetch, string][] = [
      [async () => json({ error: { message: `bad key ${KEY}` } }, 401), 'unauthorized'],
      [async () => json({}, 500), 'http_error'],
      [async () => new Response('not json'), 'bad_response'],
      [async () => Promise.reject(new TypeError('fetch failed')), 'network'],
    ]
    for (const [fetchImpl, failure] of cases) {
      const error = await fetchOpenAICosts(query, fetchImpl).catch((e: unknown) => e)
      expect(error).toBeInstanceOf(OpenAICostsError)
      expect(error).toMatchObject({ failure })
      expect(String((error as Error).message)).not.toContain(KEY)
    }
  })
})
