import { beforeEach, expect, it, vi } from 'vitest'

import { GET } from './route'

const { refresh, invalidate } = vi.hoisted(() => ({ refresh: vi.fn(), invalidate: vi.fn() }))
vi.mock('@/core/auth/supabase-admin', () => ({ createAdminSupabase: () => ({}) }))
vi.mock('@/core/admin/providers', () => ({ refreshAllCapabilities: refresh }))
vi.mock('@/core/env', () => ({ serverEnv: () => ({ CRON_SECRET: 'local-cron-fixture' }) }))
vi.mock('@/core/providers', () => ({ PROVIDERS_CACHE_TAG: 'providers' }))
vi.mock('next/cache', () => ({ revalidateTag: invalidate }))

const req = (value: string) => new Request('https://site.test/api/cron/provider-capabilities', { headers: { authorization: value } })
beforeEach(() => vi.clearAllMocks())

it('refuses missing and incorrect credentials without contacting any provider', async () => {
  for (const token of ['', 'Bearer wrong']) expect((await GET(req(token))).status).toBe(401)
  expect(refresh).not.toHaveBeenCalled()
})

it('invalidates successful refreshes even if another provider failed and needs retrying', async () => {
  refresh.mockResolvedValue({ updated: 1, failures: 1 })
  const response = await GET(req('Bearer local-cron-fixture'))
  expect(response.status).toBe(502)
  expect(await response.json()).toEqual({ updated: 1, failures: 1 })
  expect(invalidate).toHaveBeenCalledWith('providers', { expire: 0 })
})
