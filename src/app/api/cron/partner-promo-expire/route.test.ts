import { beforeEach, expect, it, vi } from 'vitest'

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('server-only', () => ({}))
vi.mock('@/core/auth/supabase-admin', () => ({ createAdminSupabase: () => ({ rpc }) }))
vi.mock('@/core/env', () => ({ serverEnv: () => ({ CRON_SECRET: 'local-cron-fixture' }) }))

const { GET } = await import('./route')

const req = (value: string) => new Request('https://site.test/api/cron/partner-promo-expire', { headers: { authorization: value } })
const ok = { expired: 1, taken: 500, overdue: 0, failed: [] }
beforeEach(() => vi.clearAllMocks())

it('refuses missing and incorrect credentials without running', async () => {
  for (const token of ['', 'Bearer wrong']) expect((await GET(req(token))).status).toBe(401)
  expect(rpc).not.toHaveBeenCalled()
})

it('runs the expiry pass, 500 when a grant failed or one is overdue', async () => {
  rpc.mockResolvedValueOnce({ data: ok, error: null })
  expect((await GET(req('Bearer local-cron-fixture'))).status).toBe(204)
  expect(rpc).toHaveBeenCalledWith('partner_promo_expire_run', {})
  rpc.mockResolvedValueOnce({ data: { ...ok, failed: [{ grant_id: 4, error: 'boom' }] }, error: null })
  expect((await GET(req('Bearer local-cron-fixture'))).status).toBe(500)
  rpc.mockResolvedValueOnce({ data: { ...ok, overdue: 1 }, error: null })
  expect((await GET(req('Bearer local-cron-fixture'))).status).toBe(500)
  rpc.mockResolvedValueOnce({ data: null, error: { message: 'boom' } })
  expect((await GET(req('Bearer local-cron-fixture'))).status).toBe(500)
})
