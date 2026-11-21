import { expect, it, vi } from 'vitest'

import { createTicketPool, POOL_BATCH_SIZE } from './ticket-pool'

const tickets = (count: number, ttl = 300) => Array.from({ length: count }, (_, i) => ({
  input_key: `inputs/u/${i}.jpg`, put_url: `https://r2/${i}`, headers: { 'Content-Type': 'image/jpeg' }, expires_in: ttl,
}))
const batchOk = (count = POOL_BATCH_SIZE, ttl = 300) => new Response(JSON.stringify({ tickets: tickets(count, ttl) }), { status: 200 })
const singleTicket = { input_key: 'inputs/u/single.jpg', put_url: 'https://r2/single', headers: {} }

it('serves ten photos from one batch request', async () => {
  const fetchMock = vi.fn(async () => batchOk())
  const single = vi.fn(async () => singleTicket)
  const take = createTicketPool({ fetch: fetchMock, single })
  const got = await Promise.all(Array.from({ length: 10 }, () => take('image/jpeg', 1000)))
  expect(fetchMock).toHaveBeenCalledTimes(1)
  expect(new Set(got.map((ticket) => ticket.input_key)).size).toBe(10)
  expect(single).not.toHaveBeenCalled()
  await take('image/jpeg', 1000)
  expect(fetchMock).toHaveBeenCalledTimes(2)
})

it('uses the single ticket for other types and when the batch request fails', async () => {
  const single = vi.fn(async () => singleTicket)
  const take = createTicketPool({ fetch: vi.fn(async () => new Response('{}', { status: 500 })), single })
  await expect(take('image/png', 1000)).resolves.toBe(singleTicket)
  await expect(take('image/jpeg', 1000)).resolves.toBe(singleTicket)
  expect(single).toHaveBeenCalledTimes(2)
})

it('drops tickets close to their end instead of using them', async () => {
  let clock = 0
  const fetchMock = vi.fn(async () => batchOk(2, 60))
  const take = createTicketPool({ fetch: fetchMock, now: () => clock, single: vi.fn(async () => singleTicket) })
  await take('image/jpeg', 1)
  clock = 45_000
  await take('image/jpeg', 1)
  expect(fetchMock).toHaveBeenCalledTimes(2)
})

it('waits out a 429 on the batch request', async () => {
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: '429' } }), { status: 429 }))
    .mockResolvedValueOnce(batchOk())
  const wait = vi.fn(async () => {})
  const take = createTicketPool({ fetch: fetchMock, wait, random: () => 0, single: vi.fn(async () => singleTicket) })
  await expect(take('image/jpeg', 1)).resolves.toMatchObject({ input_key: 'inputs/u/0.jpg' })
  expect(wait).toHaveBeenCalledWith(15_000)
})
