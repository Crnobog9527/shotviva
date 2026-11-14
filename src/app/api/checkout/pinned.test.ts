import { NextRequest } from 'next/server'
import { beforeEach, expect, it, vi } from 'vitest'
import { site } from '@/site/site.config'
import { assertSeedPreview, findRetry } from './pinned'

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), marker: vi.fn(), mode: vi.fn() }))
vi.mock('@/core/auth', () => ({
  createAdminSupabase: () => ({
    rpc: mocks.rpc,
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mocks.marker }) }) }),
  }),
}))
vi.mock('@/core/env', async (original) => ({
  ...(await original<typeof import('@/core/env')>()),
  serverEnv: () => ({ VERCEL_ENV: mocks.mode() }),
}))
beforeEach(() => {
  mocks.mode.mockReset().mockReturnValue('preview')
  mocks.marker.mockReset().mockResolvedValue({ data: null, error: null })
  mocks.rpc.mockReset().mockResolvedValue({ data: null, error: { message: 'missing RPC', code: 'PGRST202' } })
})
const check = () =>
  findRetry(
    new NextRequest('https://pr.test/api/checkout', {
      method: 'POST',
      headers: { 'idempotency-key': 'd1141cd3-3024-43d0-ad54-2969fd05edce' },
    }),
    'buyer',
    { product_id: 'pack_s', pricing_version: 'v2', method: 'card', locale: 'en' },
    'stripe',
  )

it('accepts a phase-one preview only when the migration marker is demonstrably absent and all frozen seed terms match', async () => {
  expect(await check()).toMatchObject({ legacyPreview: true })
  const baseline = site.billing.products.map((p) => ({ ...p, revision: 2 }))
  expect(() => assertSeedPreview(baseline)).not.toThrow()
  expect(() => assertSeedPreview(baseline.slice(1))).toThrow()
  expect(() => assertSeedPreview(baseline.map((p) => ({ ...p, credits: p.credits + 1 })))).toThrow()
  expect(() => assertSeedPreview(baseline.map((p) => ({ ...p, revision: 3 })))).toThrow()
})

it('refuses missing RPCs on production, after rollout preparation, or on an ambiguous database read', async () => {
  mocks.mode.mockReturnValueOnce('production')
  await expect(check()).rejects.toThrow()
  for (const state of [
    { data: { key: 'catalog_binding_required' }, error: null },
    { data: null, error: { code: '42501' } },
  ]) {
    mocks.marker.mockResolvedValueOnce(state)
    await expect(check()).rejects.toThrow()
  }
  mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'denied', code: '42501' } })
  await expect(check()).rejects.toThrow()
})

it('requires fresh confirmation if an old browser nonce may have opened a phase-one session', async () => {
  mocks.rpc.mockResolvedValueOnce({ data: null, error: null })
  await expect(check()).rejects.toMatchObject({ code: 'CODE_CHECKOUT_OFFER_CHANGED' })
})
