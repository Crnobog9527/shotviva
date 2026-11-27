import { beforeEach, expect, it, vi } from 'vitest'

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('server-only', () => ({}))
vi.mock('@/core/auth/supabase-admin', () => ({ createAdminSupabase: () => ({ rpc }) }))
vi.mock('@/core/env', () => ({ serverEnv: () => ({ CRON_SECRET: 'local-cron-fixture' }) }))

const { GET } = await import('./route')

const req = (value: string) => new Request('https://site.test/api/cron/signup-gift-catch-up', { headers: { authorization: value } })
const ok = { paid: 3, tried: 3, failed: 0, stopped: null, remaining: 0 }
beforeEach(() => vi.clearAllMocks())

it('refuses missing and incorrect credentials without running', async () => {
  for (const token of ['', 'Bearer wrong']) expect((await GET(req(token))).status).toBe(401)
  expect(rpc).not.toHaveBeenCalled()
})

it('runs one bounded batch, 500 when a grant failed or the call fails', async () => {
  rpc.mockResolvedValueOnce({ data: ok, error: null })
  expect((await GET(req('Bearer local-cron-fixture'))).status).toBe(204)
  expect(rpc).toHaveBeenCalledWith('signup_gift_catch_up', { p_limit: 50 })
  rpc.mockResolvedValueOnce({ data: { ...ok, stopped: 'daily_cap', remaining: 7 }, error: null })
  expect((await GET(req('Bearer local-cron-fixture'))).status).toBe(204)
  rpc.mockResolvedValueOnce({ data: { ...ok, failed: 1 }, error: null })
  expect((await GET(req('Bearer local-cron-fixture'))).status).toBe(500)
  rpc.mockResolvedValueOnce({ data: null, error: { message: 'boom' } })
  expect((await GET(req('Bearer local-cron-fixture'))).status).toBe(500)
})
