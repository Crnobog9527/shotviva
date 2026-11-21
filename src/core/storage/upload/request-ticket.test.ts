import { afterEach, expect, it, vi } from 'vitest'

import { requestTicket, TICKET_WAIT_LIMIT_MS } from './request-ticket'

const ticket = { input_key: 'inputs/u/k.jpg', put_url: 'https://r2/put', headers: {} }
const ok = () => new Response(JSON.stringify(ticket), { status: 200 })
// The Vercel firewall's own 429: no code of ours, no Retry-After.
const edge429 = () => new Response(JSON.stringify({ error: { code: '429' } }), { status: 429 })

afterEach(() => vi.unstubAllGlobals())

it('waits out a firewall 429 and asks again instead of failing', async () => {
  const fetchMock = vi.fn().mockResolvedValueOnce(edge429()).mockResolvedValueOnce(edge429()).mockResolvedValueOnce(ok())
  vi.stubGlobal('fetch', fetchMock)
  const wait = vi.fn(async () => {})
  await expect(requestTicket('image/jpeg', 10, '/api/uploads', { wait, random: () => 0 })).resolves.toEqual(ticket)
  expect(fetchMock).toHaveBeenCalledTimes(3)
  expect(wait).toHaveBeenCalledWith(15_000)
})

it('follows Retry-After from RATE_LIMITED', async () => {
  const limited = new Response(JSON.stringify({ code: 'RATE_LIMITED' }), { status: 429, headers: { 'Retry-After': '7' } })
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(limited).mockResolvedValueOnce(ok()))
  const wait = vi.fn(async () => {})
  await requestTicket('image/jpeg', 10, '/api/uploads', { wait, random: () => 0 })
  expect(wait).toHaveBeenCalledWith(7_000)
})

it('gives up as UPLOAD_FAILED once the wait would pass the limit', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => edge429()))
  let clock = 0
  const wait = vi.fn(async (ms: number) => { clock += ms })
  await expect(requestTicket('image/jpeg', 10, '/api/uploads', { wait, now: () => clock, random: () => 0 }))
    .rejects.toMatchObject({ code: 'UPLOAD_FAILED' })
  expect(clock).toBeLessThanOrEqual(TICKET_WAIT_LIMIT_MS)
})

it('keeps the server codes of a real refusal', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ code: 'IMAGE_TOO_LARGE', message: 'big' }), { status: 413 })))
  await expect(requestTicket('image/jpeg', 10)).rejects.toMatchObject({ code: 'IMAGE_TOO_LARGE' })
})
