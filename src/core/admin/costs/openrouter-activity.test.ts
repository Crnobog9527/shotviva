import { describe, expect, it, vi } from 'vitest'

import { OpenAICostsError } from './openai-costs'
import { fetchOpenRouterActivity, OPENROUTER_ACTIVITY_URL } from './openrouter-activity'

const KEY = 'sk-or-v1-management-test-0123456789'
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
const item = (date: string, usage: number, model = 'bytedance/seedream') => ({ date, model, usage, requests: 1, prompt_tokens: 0, completion_tokens: 0 })

describe('fetchOpenRouterActivity', () => {
  it('sums every model and endpoint per UTC day, with the management key', async () => {
    const fetchImpl = vi.fn(async () => json({ data: [item('2026-11-10', 0.5), item('2026-11-10', 0.25, 'black-forest-labs/flux'), item('2026-11-11', 1)] }))
    expect(await fetchOpenRouterActivity(KEY, fetchImpl)).toEqual({ '2026-11-10': 0.75, '2026-11-11': 1 })
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(OPENROUTER_ACTIVITY_URL)
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${KEY}`)
  })

  it('maps an inference key (403), a rate limit, bad JSON and a timeout, never echoing the key', async () => {
    const timeout = Object.assign(new Error('t'), { name: 'TimeoutError' })
    const cases: [typeof fetch, string, string | null][] = [
      [async () => json({ error: { code: 403, message: `Only management keys ${KEY}` } }, 403), 'unauthorized', null],
      [async () => json({ error: { code: 'rate_limit_exceeded', message: KEY } }, 429), 'rate_limited', 'rate_limit_exceeded'],
      [async () => json({ data: [{ date: 'x' }] }), 'bad_response', null],
      [async () => Promise.reject(timeout), 'timeout', null],
    ]
    for (const [fetchImpl, failure, code] of cases) {
      const error = await fetchOpenRouterActivity(KEY, fetchImpl).catch((e: unknown) => e)
      expect(error).toBeInstanceOf(OpenAICostsError)
      expect(error).toMatchObject({ failure, code })
      expect(String((error as Error).message)).not.toContain(KEY)
    }
  })
})
