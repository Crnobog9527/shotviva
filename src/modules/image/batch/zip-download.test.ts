import { describe, expect, it, vi } from 'vitest'

import { readZipOutcome, requestZip, stateAfter, zipRoute } from './zip-download'

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } })

describe('batch ZIP download', () => {
  it('reads the signed link as ready, and a 200 without one as an error', async () => {
    expect(await readZipOutcome(json(200, { url: 'https://r2.example/zip' }))).toEqual({ kind: 'ready', url: 'https://r2.example/zip' })
    expect(await readZipOutcome(json(200, {}))).toEqual({ kind: 'error', code: 'INTERNAL' })
  })

  it('keeps packing on 202 and waits on 429, honouring Retry-After', async () => {
    expect(await readZipOutcome(json(202, { status: 'packing' }, { 'Retry-After': '60' }))).toEqual({ kind: 'packing', retryAfterMs: 60_000 })
    expect(await readZipOutcome(json(429, { code: 'RATE_LIMITED' }, { 'Retry-After': '30' }))).toEqual({ kind: 'limited', retryAfterMs: 30_000 })
    expect(await readZipOutcome(json(429, { code: 'RATE_LIMITED' }))).toEqual({ kind: 'limited', retryAfterMs: 60_000 })
  })

  it('opens the paywall tier the server names, and passes other codes on', async () => {
    expect(await readZipOutcome(json(403, { code: 'TIER_REQUIRED', required_tier: 'pro' }))).toEqual({ kind: 'upgrade', tier: 'pro' })
    expect(await readZipOutcome(json(404, { code: 'NOT_FOUND' }))).toEqual({ kind: 'error', code: 'NOT_FOUND' })
  })

  it('asks once for JSON, and turns a network drop into an error', async () => {
    const fetcher = vi.fn(async () => json(202, {}))
    await requestZip('b', fetcher)
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(fetcher).toHaveBeenCalledWith(zipRoute('b'), { headers: { Accept: 'application/json' }, cache: 'no-store' })
    expect(await requestZip('b', vi.fn(async () => Promise.reject(new TypeError('offline'))))).toEqual({ kind: 'error', code: 'NETWORK' })
  })

  it('maps outcomes to what the button shows', () => {
    expect(stateAfter({ kind: 'ready', url: 'https://r2.example/zip' })).toEqual({ kind: 'started' })
    expect(stateAfter({ kind: 'limited', retryAfterMs: 60_000 })).toEqual({ kind: 'limited' })
    expect(stateAfter({ kind: 'upgrade', tier: 'pro' })).toEqual({ kind: 'idle' })
  })
})
