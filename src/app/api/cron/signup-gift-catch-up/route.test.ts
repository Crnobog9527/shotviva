import { beforeEach, expect, it, vi } from 'vitest'

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('server-only', () => ({}))
vi.mock('@/core/auth/supabase-admin', () => ({ createAdminSupabase: () => ({ rpc }) }))
vi.mock('@/core/env', () => ({ serverEnv: () => ({ CRON_SECRET: 'local-cron-fixture' }) }))

const { GET } = await import('./route')

const req = (value: string) => new Request('https://site.test/api/cron/signup-gift-catch-up', { headers: { authorization: value } })
vi.mock('@/core/logger', () => ({ logger: { info: vi.fn(), error: vi.fn() } }))
const ids = ['00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000003']
beforeEach(() => vi.clearAllMocks())

it('refuses missing and incorrect credentials without running', async () => {
  for (const token of ['', 'Bearer wrong']) expect((await GET(req(token))).status).toBe(401)
  expect(rpc).not.toHaveBeenCalled()
})

it('reads one bounded queue and pays each account in its own call, stopping at the cap', async () => {
  rpc.mockResolvedValueOnce({ data: ids, error: null })
  rpc.mockResolvedValueOnce({ data: 'paid', error: null })
  rpc.mockResolvedValueOnce({ data: 'daily_cap', error: null })
  expect((await GET(req('Bearer local-cron-fixture'))).status).toBe(204)
  expect(rpc.mock.calls).toEqual([
    ['signup_gift_catch_up_queue', { p_limit: 50 }],
    ['signup_gift_catch_up_one', { p_user_id: ids[0] }],
    ['signup_gift_catch_up_one', { p_user_id: ids[1] }],
  ])
})

it('a failed account does not stop the others, but answers 500; so does a failed queue read', async () => {
  rpc.mockResolvedValueOnce({ data: ids, error: null })
  rpc.mockResolvedValueOnce({ data: null, error: { message: 'boom' } })
  rpc.mockResolvedValueOnce({ data: 'same_ip_pending', error: null })
  rpc.mockResolvedValueOnce({ data: 'paid', error: null })
  expect((await GET(req('Bearer local-cron-fixture'))).status).toBe(500)
  expect(rpc).toHaveBeenCalledTimes(4)
  rpc.mockResolvedValueOnce({ data: null, error: { message: 'boom' } })
  expect((await GET(req('Bearer local-cron-fixture'))).status).toBe(500)
})
