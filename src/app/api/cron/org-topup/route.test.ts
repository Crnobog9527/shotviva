import { beforeEach, expect, it, vi } from 'vitest'

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('server-only', () => ({}))
vi.mock('@/core/auth/supabase-admin', () => ({ createAdminSupabase: () => ({ rpc }) }))
vi.mock('@/core/env', () => ({ serverEnv: () => ({ CRON_SECRET: 'local-cron-fixture' }) }))

const { GET } = await import('./route')

const req = (value: string) => new Request('https://site.test/api/cron/org-topup', { headers: { authorization: value } })
beforeEach(() => vi.clearAllMocks())

it('refuses missing and incorrect credentials without topping anyone up', async () => {
  for (const token of ['', 'Bearer wrong']) expect((await GET(req(token))).status).toBe(401)
  expect(rpc).not.toHaveBeenCalled()
})

it('tops up for the current UTC month, 500 when the run failed', async () => {
  vi.useFakeTimers({ now: new Date('2026-12-01T00:20:00Z') })
  rpc.mockResolvedValueOnce({ data: { period: '2026-12', members: 3, granted: 300, short_orgs: 0 }, error: null })
  expect((await GET(req('Bearer local-cron-fixture'))).status).toBe(204)
  expect(rpc).toHaveBeenCalledWith('org_monthly_topup', { p_period: '2026-12' })
  rpc.mockResolvedValueOnce({ data: null, error: { message: 'boom' } })
  expect((await GET(req('Bearer local-cron-fixture'))).status).toBe(500)
  vi.useRealTimers()
})
