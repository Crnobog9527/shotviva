import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { probeArk } from './ark-probe'

describe('the Ark reachability probe', () => {
  it('reports a 401 as an open route and never sends a key', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response('{}', { status: 401 }))
    const result = await probeArk(fetcher, 2)
    expect(result.attempts).toEqual([expect.objectContaining({ ok: true, status: 401, code: null }), expect.objectContaining({ ok: true, status: 401 })])
    const init = fetcher.mock.calls[0]![1]!
    expect(JSON.stringify(init.headers ?? {})).not.toMatch(/authorization/i)
  })

  it('reports a connect failure by code only', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => { throw new TypeError('fetch failed', { cause: Object.assign(new Error('connect timeout https://x?token=1'), { code: 'UND_ERR_CONNECT_TIMEOUT' }) }) })
    const result = await probeArk(fetcher, 1)
    expect(result.attempts[0]).toMatchObject({ ok: false, status: null, code: 'UND_ERR_CONNECT_TIMEOUT' })
  })
})
