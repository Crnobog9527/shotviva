import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ cacheLife: () => undefined, cacheTag: () => undefined }))
vi.mock('../../logger', () => ({ logger: { warn: vi.fn(), error: vi.fn() } }))

const { readBlock } = await import('./load')
const { PostHogQueryError } = await import('./posthog-query')
const { WEEK } = await import('./test-samples')

describe('readBlock (one block failing leaves the others)', () => {
  it('passes the window and data through', async () => {
    expect(await readBlock('pages', async () => ({ window: WEEK, data: [1] }))).toEqual({ status: 'ok', window: WEEK, data: [1] })
  })

  it('turns a PostHog failure or any other error into 「暂时读不到」 for that block', async () => {
    expect(await readBlock('funnel', async () => Promise.reject(new PostHogQueryError('rate_limited', 429)))).toEqual({ status: 'error' })
    expect(await readBlock('funnel', async () => Promise.reject(new Error('boom')))).toEqual({ status: 'error' })
  })
})
