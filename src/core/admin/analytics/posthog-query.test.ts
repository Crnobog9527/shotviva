import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { POSTHOG_APP_HOST, PostHogQueryError, rowsOf, runHogQL } from './posthog-query'
import { sample } from './test-samples'

const KEY = 'phx_test_personal_key_0123456789'
const access = { apiKey: KEY, projectId: '712352' }
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

describe('runHogQL (PostHog Query API)', () => {
  it('posts a named HogQLQuery to the project with the personal key as a Bearer token', async () => {
    const fetchImpl = vi.fn(async () => json(sample('pages.bounce')))
    const answer = await runHogQL(access, { name: 'pages.bounce', query: 'SELECT 1' }, fetchImpl)
    expect(answer.columns).toEqual(['path', 'sessions', 'bounces'])
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`${POSTHOG_APP_HOST}/api/projects/712352/query/`)
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${KEY}`)
    expect(JSON.parse(init.body as string)).toEqual({ query: { kind: 'HogQLQuery', query: 'SELECT 1' }, name: 'shotviva-admin: pages.bounce' })
    // The key only travels in the header.
    expect(url).not.toContain(KEY)
    expect(init.body).not.toContain(KEY)
  })

  it('maps a refused key, the rate limit, other HTTP errors, bad JSON and network failures, never echoing the key', async () => {
    const cases: [typeof fetch, string, number | null][] = [
      [async () => json({ detail: `Invalid personal API key ${KEY}` }, 401), 'unauthorized', 401],
      [async () => json({ type: 'validation_error', code: 'permission_denied' }, 403), 'unauthorized', 403],
      [async () => json({ code: 'api_queries_budget_exceeded' }, 429), 'rate_limited', 429],
      [async () => json({ detail: 'Query timed out' }, 504), 'http_error', 504],
      [async () => new Response('<html>oops</html>'), 'bad_response', 200],
      [async () => json({ results: 'nope' }), 'bad_response', 200],
      [async () => Promise.reject(new TypeError('fetch failed')), 'network', null],
      [async () => Promise.reject(Object.assign(new Error('t'), { name: 'TimeoutError' })), 'timeout', null],
    ]
    for (const [fetchImpl, failure, status] of cases) {
      const error = await runHogQL(access, { name: 'x', query: 'SELECT 1' }, fetchImpl).catch((e: unknown) => e)
      expect(error).toBeInstanceOf(PostHogQueryError)
      expect(error).toMatchObject({ failure, status })
      expect(String((error as Error).message)).not.toContain(KEY)
    }
  })
})

describe('rowsOf', () => {
  it('turns rows into objects by column name', () => {
    const rows = rowsOf(sample('templates.buyers'), z.object({ template: z.string(), buyers: z.number() }))
    expect(rows).toEqual([
      { template: 'ramen-studio', buyers: 11 },
      { template: 'white-ground', buyers: 4 },
    ])
  })

  it('fails the block on a row that does not fit, instead of drawing wrong numbers', () => {
    expect(() => rowsOf(sample('templates.buyers'), z.object({ template: z.string(), buyers: z.string() }))).toThrow(PostHogQueryError)
  })
})
