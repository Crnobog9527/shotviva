import { afterEach, expect, it, vi } from 'vitest'

import { readJobs, submitJob } from './job-api'

afterEach(() => vi.unstubAllGlobals())

const body = { template_id: 'food', input_key: 'inputs/u/a.jpg', inputs: { copy: {}, aspect_ratio: 'original', resolution: '1k' } }

it('reads the Vercel firewall’s own 429 as a wait, not a failure', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: { code: '429' } }), { status: 429 })))
  const outcome = await submitJob('00000000-0000-4000-8000-000000000001', body)
  expect(outcome.kind).toBe('limited')
  if (outcome.kind === 'limited') expect(outcome.retryAfterMs).toBeGreaterThanOrEqual(15_000)
})

it('follows Retry-After on RATE_LIMITED', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ code: 'RATE_LIMITED' }), { status: 429, headers: { 'Retry-After': '15' } })))
  const outcome = await submitJob('00000000-0000-4000-8000-000000000001', body)
  expect(outcome).toMatchObject({ kind: 'limited' })
  if (outcome.kind === 'limited') expect(outcome.retryAfterMs).toBeGreaterThanOrEqual(15_000)
})

it('asks for many jobs in one request and marks the absent ones missing', async () => {
  const fetchMock = vi.fn<(url: string) => Promise<Response>>(async () => new Response(JSON.stringify({ jobs: [{ id: 'a', status: 'running' }] }), { status: 200 }))
  vi.stubGlobal('fetch', fetchMock)
  const views = await readJobs(['a', 'b'])
  expect(fetchMock).toHaveBeenCalledTimes(1)
  expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/generate/status?ids=a,b')
  expect(views?.get('a')).toMatchObject({ status: 'running' })
  expect(views?.get('b')).toBe('missing')
})

it('splits more than 50 ids and fails the pass as a whole on an error', async () => {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ jobs: [] }), { status: 200 }))
  vi.stubGlobal('fetch', fetchMock)
  await readJobs(Array.from({ length: 60 }, (_, i) => `id${i}`))
  expect(fetchMock).toHaveBeenCalledTimes(2)
  vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 500 })))
  expect(await readJobs(['a'])).toBeNull()
})

it('marks a 429 that carries a refunded job as settled', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ code: 'RATE_LIMITED', job_id: 'j1', refunded: true }), { status: 429, headers: { 'Retry-After': '15' } })))
  expect(await submitJob('00000000-0000-4000-8000-000000000001', body)).toMatchObject({ kind: 'limited', settled: true })
})
