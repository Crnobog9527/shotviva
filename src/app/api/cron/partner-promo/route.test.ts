import { beforeEach, expect, it, vi } from 'vitest'

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('server-only', () => ({}))
vi.mock('@/core/auth/supabase-admin', () => ({ createAdminSupabase: () => ({ rpc }) }))
vi.mock('@/core/env', () => ({ serverEnv: () => ({ CRON_SECRET: 'local-cron-fixture' }) }))

const { GET } = await import('./route')

const req = (value: string) => new Request('https://site.test/api/cron/partner-promo', { headers: { authorization: value } })
const ok = { period: '2026-12', expired: 1, taken: 500, lapsed: 0, sheets: 2, pending: 2, failed_orgs: [], failed_expiries: [] }
beforeEach(() => vi.clearAllMocks())

it('refuses missing and incorrect credentials without running', async () => {
  for (const token of ['', 'Bearer wrong']) expect((await GET(req(token))).status).toBe(401)
  expect(rpc).not.toHaveBeenCalled()
})

it('runs for the current UTC month, 500 when a partner or an expiry failed', async () => {
  vi.useFakeTimers({ now: new Date('2026-12-01T00:40:00Z') })
  rpc.mockResolvedValueOnce({ data: ok, error: null })
  expect((await GET(req('Bearer local-cron-fixture'))).status).toBe(204)
  expect(rpc).toHaveBeenCalledWith('partner_promo_run', { p_period: '2026-12' })
  rpc.mockResolvedValueOnce({ data: { ...ok, failed_orgs: [{ org_id: '6a1f0c2e-0d5b-4f6a-9c1e-2b3d4e5f6a7b', error: 'boom' }] }, error: null })
  expect((await GET(req('Bearer local-cron-fixture'))).status).toBe(500)
  rpc.mockResolvedValueOnce({ data: { ...ok, failed_expiries: [{ grant_id: 4, error: 'boom' }] }, error: null })
  expect((await GET(req('Bearer local-cron-fixture'))).status).toBe(500)
  rpc.mockResolvedValueOnce({ data: null, error: { message: 'boom' } })
  expect((await GET(req('Bearer local-cron-fixture'))).status).toBe(500)
  vi.useRealTimers()
})
