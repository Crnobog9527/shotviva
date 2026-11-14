import { describe, expect, it, vi } from 'vitest'

import { createServerTracker, type ServerTrackerDeps } from './server-track'

type Fetch = NonNullable<ServerTrackerDeps['fetch']>

function setup(overrides: { key?: string; fetch?: Fetch } = {}) {
  const tasks: (() => Promise<void>)[] = []
  const fetch = vi.fn<Fetch>(overrides.fetch ?? (async () => ({ ok: true, status: 200 })))
  const track = createServerTracker({
    key: overrides.key ?? 'phc_test',
    host: 'https://us.i.posthog.com',
    fetch,
    schedule: (task) => void tasks.push(task),
    now: () => new Date('2026-11-05T12:00:00Z'),
  })
  const flush = () => Promise.all(tasks.map((task) => task()))
  return { track, fetch, flush, tasks }
}

describe('server track', () => {
  it('posts a validated event to the capture endpoint after the response', async () => {
    const { track, fetch, flush, tasks } = setup()
    track('signup', { method: 'email' }, { distinctId: 'user-1', locale: 'zh' })
    expect(fetch).not.toHaveBeenCalled()
    expect(tasks).toHaveLength(1)
    await flush()

    const [url, init] = fetch.mock.calls[0] ?? []
    expect(url).toBe('https://us.i.posthog.com/i/v0/e/')
    expect(JSON.parse(String(init?.body))).toEqual({
      api_key: 'phc_test',
      event: 'signup',
      distinct_id: 'user-1',
      properties: { method: 'email', locale: 'zh', $lib: 'shotviva-server' },
      timestamp: '2026-11-05T12:00:00.000Z',
    })
  })

  it('is a no-op without a project key', () => {
    const { track, tasks } = setup({ key: '' })
    track('signup', { method: 'email' }, { distinctId: 'user-1', locale: 'zh' })
    expect(tasks).toHaveLength(0)
  })

  it('drops an event whose properties fail the dictionary, without throwing', () => {
    const { track, tasks } = setup()
    const props = { method: 'email', email: 'a@b.co' } as unknown as { method: 'email' }
    expect(() => track('signup', props, { distinctId: 'user-1', locale: 'zh' })).not.toThrow()
    expect(tasks).toHaveLength(0)
  })

  it('swallows network failures and rejected responses', async () => {
    const failing = setup({ fetch: async () => Promise.reject(new Error('ECONNRESET')) })
    failing.track('signup', { method: 'google' }, { distinctId: 'user-1', locale: 'zh' })
    await expect(failing.flush()).resolves.toBeDefined()

    const rejected = setup({ fetch: async () => ({ ok: false, status: 401 }) })
    rejected.track('signup', { method: 'google' }, { distinctId: 'user-1', locale: 'zh' })
    await expect(rejected.flush()).resolves.toBeDefined()
  })
})
