import { beforeEach, expect, it, vi } from 'vitest'

const { refund } = vi.hoisted(() => ({ refund: vi.fn() }))
vi.mock('server-only', () => ({}))
vi.mock('@/core/poster/stale-photos', () => ({ refundStalePhotos: refund }))
vi.mock('@/core/auth', () => ({ createAdminSupabase: () => ({}) }))
vi.mock('@/core/env', () => ({ serverEnv: () => ({ CRON_SECRET: 'local-cron-fixture' }) }))

const { GET } = await import('./route')

const req = (value: string) => new Request('https://site.test/api/cron/poster-photos', { headers: { authorization: value } })
beforeEach(() => vi.clearAllMocks())

it('refuses missing and incorrect credentials without touching any run', async () => {
  for (const token of ['', 'Bearer wrong']) expect((await GET(req(token))).status).toBe(401)
  expect(refund).not.toHaveBeenCalled()
})

it('reports what the sweep refunded, 500 when it failed', async () => {
  refund.mockResolvedValueOnce({ refunded: 2, skipped: 1 })
  const ok = await GET(req('Bearer local-cron-fixture'))
  expect(await ok.json()).toEqual({ refunded: 2, skipped: 1 })
  refund.mockRejectedValueOnce(new Error('down'))
  expect((await GET(req('Bearer local-cron-fixture'))).status).toBe(500)
})
