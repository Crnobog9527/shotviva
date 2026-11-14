import { beforeEach, expect, it, vi } from 'vitest'

import { GET } from './route'

const { send } = vi.hoisted(() => ({ send: vi.fn() }))
vi.mock('@/core/ops-brief/load', () => ({ sendDailyBrief: send }))
vi.mock('@/core/env', () => ({ serverEnv: () => ({ CRON_SECRET: 'local-cron-fixture' }) }))

const req = (value: string) => new Request('https://site.test/api/cron/daily-brief', { headers: { authorization: value } })
beforeEach(() => vi.clearAllMocks())

it('refuses missing and incorrect credentials without reading anything', async () => {
  for (const token of ['', 'Bearer wrong']) expect((await GET(req(token))).status).toBe(401)
  expect(send).not.toHaveBeenCalled()
})

it('reports the outcome, 500 only when the brief failed', async () => {
  send.mockResolvedValueOnce('sent')
  expect((await GET(req('Bearer local-cron-fixture'))).status).toBe(200)
  send.mockResolvedValueOnce('not_configured')
  const quiet = await GET(req('Bearer local-cron-fixture'))
  expect(await quiet.json()).toEqual({ outcome: 'not_configured' })
  send.mockResolvedValueOnce('failed')
  expect((await GET(req('Bearer local-cron-fixture'))).status).toBe(500)
})
